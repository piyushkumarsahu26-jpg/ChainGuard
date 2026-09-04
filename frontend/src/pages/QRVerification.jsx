import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  QrCode, Camera, Upload, X, ShieldCheck, MapPin, User as UserIcon,
  Truck, Gauge, Clock, Search, ArrowRightLeft, CheckCircle2, Loader2, Cpu, AlertTriangle,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import custodyService from '../services/custodyService';
import userService from '../services/userService';
import envelopeService from '../services/envelopeService';

// Matches EnvelopeScanner.jsx's damageVariant/formatDamageLabel exactly —
// this page shows AI detection results too (Part 9), so the same
// case-insensitive class -> color mapping applies here for the same
// reason (this project has trained models with both uppercase and
// lowercase class names across its history).
const damageVariant = { SAFE: 'primary', TORN: 'danger', OPENED: 'warning', CRUSHED: 'danger', TAPED: 'warning', PARTIAL_DAMAGE: 'warning' };
const getDamageVariant = (predictedClass) => damageVariant[(predictedClass || '').toUpperCase()] || 'neutral';
const formatLabel = (value) => (value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

const sealStatusVariant = { SEALED: 'primary', BROKEN: 'danger', TAMPERED: 'danger', OPENED: 'warning' };

const EVENT_LABELS = {
  CREATED: 'Created', QR_GENERATED: 'QR Generated', QR_SCAN: 'QR Scanned', HANDOVER: 'Handover Initiated', HANDOVER_ACCEPTED: 'Handover Accepted',
  TRANSPORT_START: 'Transport Started', TRANSPORT_END: 'Transport Ended', RECEIVED_AT_CENTER: 'Received at Centre',
  OPENED: 'Opened', SEAL_BROKEN: 'Seal Broken', DISCREPANCY: 'Discrepancy', VERIFIED: 'Verified',
  DAMAGED: 'Damaged', TAMPERED: 'Tampered', ARCHIVED: 'Archived',
  QR_PRINTED: 'QR Printed', QR_ATTACHED: 'QR Attached', PACKED: 'Packed', SEALED: 'Sealed', CHECKPOINT: 'Checkpoint',
  AI_VERIFIED: 'AI Verified', COMPLETED: 'Accepted',
};

// Best-effort real device GPS — never blocks the workflow if denied or
// unavailable (the backend's own latitude/longitude fields are optional
// for exactly this reason, per custody.validator.js).
function captureGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 4000 }
    );
  });
}

export default function QRVerification() {
  const { user, pushToast } = useApp();

  const [scannerMode, setScannerMode] = useState(null); // null | 'camera' -- 'upload' removed: file decoding no longer changes which branch renders, see onFileSelected's own comment
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);
  // Fix (Final Verification Sprint): tracks the file-decode phase
  // specifically, independent of scannerMode/loading -- decoding an
  // uploaded image must never switch the page away from the "choose how
  // to verify" screen the way starting the camera legitimately does.
  const [decodingFile, setDecodingFile] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // verifyByQr() response
  const [history, setHistory] = useState([]);
  // Architectural Integration sprint (Phase 7 refinement): optional --
  // the officer scanning can state which centre they're actually at, so
  // custody.service.js's checkAssignmentMismatch() has something real to
  // compare against. Left blank, verification proceeds exactly as
  // before (the check is simply skipped, per its own backend comment).
  const [scanningCentre, setScanningCentre] = useState('');
  // Phase 8: the inline "Start AI Verification" action -- no navigation
  // to the Envelope Scanner page required.
  const aiFileInputRef = useRef(null);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [pendingHandovers, setPendingHandovers] = useState([]);
  const [officers, setOfficers] = useState([]);

  const [transferModal, setTransferModal] = useState(null); // null | 'initiate' | 'accept'
  const [transferForm, setTransferForm] = useState({ toOfficerId: '', location: '', remarks: '' });
  const [transferBusy, setTransferBusy] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFilters, setSearchFilters] = useState({ envelopeCode: '', officerId: '', center: '', dateFrom: '', dateTo: '' });
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    userService.getOfficers().then(setOfficers).catch(() => {});
    custodyService.listPendingHandovers().then(setPendingHandovers).catch(() => {});
  }, []);

  // --- Verification (shared by camera scan, file upload, and manual entry) ---
  const verify = async (qrCode) => {
    setLoading(true);
    setAiResult(null);
    try {
      const geo = await captureGeolocation();
      const verifyResult = await custodyService.verifyByContent(qrCode, {
        latitude: geo?.latitude,
        longitude: geo?.longitude,
        scanningCentre: scanningCentre.trim() || undefined,
      });
      setResult(verifyResult);
      const fullHistory = await custodyService.getTrackingHistory(verifyResult.envelope.id);
      setHistory(fullHistory);
      const label = verifyResult.unifiedReport?.decision === 'SUSPICIOUS' ? 'warning' : 'success';
      pushToast({ type: label, title: verifyResult.unifiedReport?.decision === 'SUSPICIOUS' ? 'Verified — flagged suspicious' : 'Envelope verified', message: verifyResult.envelope.envelopeCode });
    } catch (err) {
      console.error('QR verify error:', err);
      setResult(null);
      setHistory([]);
      pushToast({ type: 'error', title: 'Verification failed', message: err?.response?.data?.message || 'This QR code does not match any envelope.' });
    } finally {
      setLoading(false);
      stopCamera();
    }
  };

  // Phase 8: "Start AI Verification" inline, no navigation to the
  // Envelope Scanner page required. Reuses envelopeService.scan() --
  // the exact same endpoint/logic that page itself calls, not a
  // duplicate scan implementation.
  const handleAiVerification = async (file) => {
    if (!result?.envelope?.id || !file) return;
    setAiScanning(true);
    try {
      const scanResult = await envelopeService.scan(result.envelope.id, file);
      setAiResult(scanResult);
      // Read-only re-fetch of the envelope's current state (sealStatus
      // may have just changed) -- deliberately not a second
      // verifyByContent() call, which would re-run the entire
      // verification pipeline (duplicate-scan check, assignment check,
      // etc.) and create a second, redundant VERIFIED custody event for
      // what is really just a display refresh.
      const freshEnvelope = await envelopeService.getById(result.envelope.id);
      setResult((prev) => (prev ? { ...prev, envelope: { ...prev.envelope, ...freshEnvelope } } : prev));
      const fullHistory = await custodyService.getTrackingHistory(result.envelope.id);
      setHistory(fullHistory);
      pushToast({
        type: scanResult.envelope.sealStatus === 'SEALED' ? 'success' : 'warning',
        title: scanResult.envelope.sealStatus === 'SEALED' ? 'AI verification complete — accepted' : 'AI verification complete — damage detected',
        message: `${scanResult.detections.length} finding(s)`,
      });
    } catch (err) {
      console.error('AI verification error:', err);
      pushToast({ type: 'error', title: 'AI verification failed', message: err?.response?.data?.message || err.message });
    } finally {
      setAiScanning(false);
    }
  };

  // --- Camera scanning ---
  const startCamera = async () => {
    setScannerMode('camera');
    setScanning(true);
    try {
      const scanner = new Html5Qrcode('qr-reader-region');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decodedText) => verify(decodedText),
        () => {} // per-frame "no QR found yet" — expected, not an error
      );
    } catch (err) {
      console.error('Camera start error:', err);
      pushToast({ type: 'error', title: 'Camera unavailable', message: 'Could not access a camera — try uploading a QR image instead.' });
      setScanning(false);
      setScannerMode(null);
    }
  };

  const stopCamera = () => {
    if (scannerRef.current && scanning) {
      // Fix (found by live end-to-end testing): a real, reproducible
      // race condition -- `scanning` is set true immediately in
      // startCamera(), before the async scanner.start() call actually
      // resolves. Clicking Cancel during that window (a real thing a
      // user can do, not just a test artifact) called .stop()/.clear()
      // on a scanner the library still considered not-yet-running,
      // throwing "Cannot stop, scanner is not running or paused" --
      // .clear() had no error handling at all, so this went uncaught
      // and left the page stuck instead of returning to the initial
      // screen. Wrapped so cleanup can never throw regardless of the
      // scanner's actual internal state.
      try {
        scannerRef.current.stop().catch(() => {});
      } catch {
        // .stop() can throw synchronously too, not only reject -- both are ignored the same way, matching the existing .catch(() => {}) intent above
      }
      try {
        scannerRef.current.clear?.();
      } catch {
        // Same reasoning -- clearing a scanner that never finished starting is not a real failure worth surfacing
      }
    }
    setScanning(false);
  };

  useEffect(() => () => stopCamera(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- File upload scanning ---
  // Fix (Final Verification Sprint): root cause of the regression was
  // reusing the camera's own DOM container id ('qr-reader-region') for
  // file decoding too. That element only exists in the JSX branch
  // rendered when scannerMode is truthy -- but this function used to
  // call setScannerMode('upload') and then, in the same synchronous
  // call, immediately try to construct a Html5Qrcode instance against
  // that id. React state updates don't apply to the DOM synchronously,
  // so at that exact moment the element genuinely did not exist yet,
  // throwing "HTML Element with id=qr-reader-region not found" -- and
  // since the catch block never reset scannerMode, the page stayed
  // stuck showing that branch's (now practically empty, since it isn't
  // camera mode) content with only its Cancel button.
  //
  // Fixed by never touching scannerMode here at all -- file decoding
  // uses its own separate, always-rendered hidden element
  // (qr-file-decode-region, unconditionally present in the JSX below,
  // never the camera's element) and its own decodingFile loading flag,
  // so the "choose how to verify" screen never disappears. A successful
  // decode calls the exact same verify() the camera path already uses,
  // which sets `result` and naturally shows the results view -- the
  // same transition that already worked, not a new one.
  const onFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset immediately so selecting the same file again still fires onChange
    if (!file) return;

    setDecodingFile(true);
    try {
      const scanner = new Html5Qrcode('qr-file-decode-region');
      const decodedText = await scanner.scanFile(file, false);
      await verify(decodedText);
    } catch (err) {
      console.error('QR file decode error:', err);
      pushToast({
        type: 'error',
        title: 'Unable to detect a QR code',
        message: 'Please upload a clear image containing one QR code.',
      });
    } finally {
      // Always reached regardless of success/failure -- the page can
      // never get stuck in a decoding state (requirement 4).
      setDecodingFile(false);
    }
  };

  const reset = () => {
    stopCamera();
    setScannerMode(null);
    setResult(null);
    setHistory([]);
    setAiResult(null);
  };

  // --- Handover ---
  const openInitiate = () => {
    setTransferForm({ toOfficerId: '', location: result?.envelope?.center || '', remarks: '' });
    setTransferModal('initiate');
  };
  const openAccept = () => {
    setTransferForm({ toOfficerId: '', location: '', remarks: '' });
    setTransferModal('accept');
  };

  const submitTransfer = async () => {
    if (!result) return;
    setTransferBusy(true);
    try {
      const geo = await captureGeolocation();
      if (transferModal === 'initiate') {
        if (!transferForm.toOfficerId) {
          pushToast({ type: 'error', title: 'Choose a receiving officer', message: '' });
          setTransferBusy(false);
          return;
        }
        await custodyService.initiateHandover({
          qrCode: result.envelope.qrCode,
          toOfficerId: transferForm.toOfficerId,
          location: transferForm.location || result.envelope.center,
          remarks: transferForm.remarks,
          ...(geo || {}),
        });
        pushToast({ type: 'success', title: 'Handover initiated', message: 'Awaiting acceptance from the receiving officer.' });
      } else {
        await custodyService.acceptHandover({
          qrCode: result.envelope.qrCode,
          location: transferForm.location || result.envelope.center,
          remarks: transferForm.remarks,
          ...(geo || {}),
        });
        pushToast({ type: 'success', title: 'Handover accepted', message: 'Custody transferred to you.' });
        custodyService.listPendingHandovers().then(setPendingHandovers).catch(() => {});
      }
      setTransferModal(null);
      await verify(result.envelope.qrCode); // refresh timeline/status
    } catch (err) {
      console.error('Transfer error:', err);
      pushToast({ type: 'error', title: 'Transfer failed', message: err?.response?.data?.message || err.message });
    } finally {
      setTransferBusy(false);
    }
  };

  // --- Search ---
  const runSearch = async () => {
    setSearching(true);
    try {
      const cleaned = Object.fromEntries(Object.entries(searchFilters).filter(([, v]) => v));
      const results = await custodyService.search(cleaned);
      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
      pushToast({ type: 'error', title: 'Search failed', message: err?.response?.data?.message || err.message });
    } finally {
      setSearching(false);
    }
  };

  const myPendingForThisEnvelope = result && pendingHandovers.find((h) => h.envelope.id === result.envelope.id && h.toOfficerId === user?.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">QR Verification</h1>
          <p className="text-slate-500 text-sm mt-1">Scan an envelope's QR code to verify authenticity and manage custody transfers.</p>
        </div>
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="inline-flex items-center gap-2 bg-bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100 hover:border-primary-500/30"
        >
          <Search size={15} /> Search History
        </button>
      </div>

      {pendingHandovers.length > 0 && (
        <Card className="p-4 bg-warning/5 ring-1 ring-warning/30">
          <p className="text-sm text-warning font-medium flex items-center gap-2">
            <ArrowRightLeft size={15} /> {pendingHandovers.length} handover{pendingHandovers.length > 1 ? 's' : ''} waiting for you — scan the envelope's QR code to accept.
          </p>
        </Card>
      )}

      {searchOpen && (
        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-4">Search Chain of Custody</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input placeholder="Envelope code" value={searchFilters.envelopeCode} onChange={(e) => setSearchFilters((f) => ({ ...f, envelopeCode: e.target.value }))} className="bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200" />
            <select value={searchFilters.officerId} onChange={(e) => setSearchFilters((f) => ({ ...f, officerId: e.target.value }))} className="bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200">
              <option value="">Any officer</option>
              {officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input placeholder="District / center" value={searchFilters.center} onChange={(e) => setSearchFilters((f) => ({ ...f, center: e.target.value }))} className="bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200" />
            <input type="date" value={searchFilters.dateFrom} onChange={(e) => setSearchFilters((f) => ({ ...f, dateFrom: e.target.value }))} className="bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200" />
            <input type="date" value={searchFilters.dateTo} onChange={(e) => setSearchFilters((f) => ({ ...f, dateTo: e.target.value }))} className="bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200" />
          </div>
          <button onClick={runSearch} disabled={searching} className="mt-3 inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-bg font-medium rounded-xl px-4 py-2 text-sm">
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Search
          </button>
          {searchResults && (
            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
              {searchResults.items.length === 0 ? (
                <p className="text-sm text-slate-500">No matching custody events.</p>
              ) : searchResults.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm bg-bg-elevated rounded-lg px-3 py-2">
                  <span className="text-slate-300">{EVENT_LABELS[item.eventType] || item.eventType} — {item.envelope?.envelopeCode}</span>
                  <span className="text-slate-500 text-xs">{item.officer?.name} · {new Date(item.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!result && (
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4 py-8">
            {!scannerMode && (
              <>
                <QrCode size={48} className="text-slate-500" />
                <p className="text-slate-400 text-sm">Choose how to verify an envelope</p>
                <div className="w-full max-w-xs">
                  <label className="text-xs text-slate-500 mb-1 block">Verifying at centre (optional)</label>
                  <input
                    value={scanningCentre}
                    onChange={(e) => setScanningCentre(e.target.value)}
                    placeholder="e.g. Government Engineering College"
                    className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
                  />
                  <p className="text-[11px] text-slate-600 mt-1">If provided, the envelope's assigned centre is checked against this.</p>
                </div>
                {/* Fix (requirement 3): a real, visible loading state
                    during file decoding -- the rest of this screen (the
                    buttons below, the centre input above) stays exactly
                    as it was, just disabled, rather than disappearing. */}
                {decodingFile ? (
                  <p className="text-sm text-slate-400 flex items-center gap-2 py-1">
                    <Loader2 size={14} className="animate-spin" /> Decoding QR Image… Please wait while we read the QR code.
                  </p>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={startCamera} className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-bg font-medium rounded-xl px-5 py-2.5 text-sm">
                      <Camera size={16} /> Use Camera
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 bg-bg-elevated border border-border hover:border-primary-500/30 text-slate-300 rounded-xl px-5 py-2.5 text-sm">
                      <Upload size={16} /> Upload QR Image
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Fix (found by live end-to-end testing, same root cause as
                the upload regression): this element is now
                unconditionally rendered -- its visibility/size is
                controlled by CSS below based on scannerMode, not by
                conditional rendering. Previously it only existed in the
                JSX branch shown once scannerMode was already truthy,
                but startCamera() called setScannerMode('camera') and
                then, in the same synchronous call, immediately
                constructed a Html5Qrcode instance against this id --
                React state updates are never applied to the DOM
                synchronously, so the element was guaranteed not to
                exist yet at that exact moment, regardless of timing.
                Confirmed via the library's own source
                (html5-qrcode.js): the element-existence check happens
                in the constructor itself, not inside the later async
                start()/scanFile() calls, so this was a real, always-
                reproducible bug, not an intermittent one -- it simply
                wasn't caught by the original report, which was focused
                on the upload path specifically. */}
            <div
              id="qr-reader-region"
              className="w-full max-w-sm rounded-xl overflow-hidden bg-bg-elevated"
              style={scannerMode === 'camera' ? { minHeight: 280 } : { width: 0, height: 0, minHeight: 0, overflow: 'hidden' }}
            />
            {scannerMode === 'camera' && (
              <>
                {loading && <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Verifying…</p>}
                <button onClick={reset} className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200">
                  <X size={14} /> Cancel
                </button>
              </>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
          </div>
          {/* Fix (root cause): file decoding's own dedicated element,
              completely independent of the camera's qr-reader-region
              above -- unconditionally present regardless of
              scannerMode, so it always exists in the DOM by the time
              onFileSelected runs. Zero-size and never displayed
              (scanFile is called with showImage=false); its only job is
              to exist for Html5Qrcode's constructor to find. */}
          <div id="qr-file-decode-region" style={{ display: 'none' }} />
        </Card>
      )}

      {result && (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-primary-500" />
                <h3 className="font-display font-semibold text-slate-100">{result.envelope.envelopeCode}</h3>
                <Badge variant={sealStatusVariant[result.envelope.sealStatus] || 'neutral'} dot>{result.envelope.sealStatus}</Badge>
              </div>
              <button onClick={reset} className="text-xs text-slate-500 hover:text-slate-300">Scan another</button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <Row icon={MapPin} label="Center" value={result.envelope.center} />
              <Row icon={UserIcon} label="Exam" value={`${result.envelope.exam} — ${result.envelope.subject}`} />
              <Row icon={Clock} label="Created" value={result.envelope.createdAt ? new Date(result.envelope.createdAt).toLocaleString() : '—'} />
              <Row icon={Clock} label="Latest Event" value={result.latestEvent ? `${EVENT_LABELS[result.latestEvent.eventType] || result.latestEvent.eventType} (${new Date(result.latestEvent.timestamp).toLocaleString()})` : 'None yet'} />
              <Row icon={UserIcon} label="Current Officer" value={result.latestEvent?.officer?.name || result.envelope.createdBy?.name || '—'} />
            </div>

            {/* Phase 4: Duplicate Scan Detection */}
            {result.duplicateScan?.detected && (
              <div className="rounded-xl p-4 bg-warning/10 border border-warning/30 space-y-1">
                <p className="text-sm font-medium text-warning flex items-center gap-1.5"><AlertTriangle size={14} /> Duplicate Scan Detected</p>
                <p className="text-xs text-slate-400">
                  Scanned again {result.duplicateScan.secondsSinceLast}s after a prior scan by a different officer/device
                  {result.duplicateScan.previousLocation ? ` at ${result.duplicateScan.previousLocation}` : ''}. A HIGH priority alert has been raised.
                </p>
              </div>
            )}

            {/* QR Verification & Digital Authentication sprint (Phase 2/10):
                signature status + the unified AI/QR/transport decision. */}
            {result.unifiedReport && (
              <div className={`rounded-xl p-4 space-y-2 border ${result.unifiedReport.decision === 'SUSPICIOUS' ? 'bg-danger/10 border-danger/30' : 'bg-primary-500/10 border-primary-500/30'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400 flex items-center gap-1.5"><ShieldCheck size={13} /> Security Verification</p>
                  <Badge variant={result.unifiedReport.decision === 'SUSPICIOUS' ? 'danger' : 'primary'} dot>{result.unifiedReport.decision}</Badge>
                </div>
                <Row
                  icon={ShieldCheck}
                  label="QR Signature"
                  value={result.signatureStatus === 'VALID' ? 'Valid' : result.signatureStatus === 'INVALID' ? 'Invalid — tampered or forged' : 'Unsigned legacy QR'}
                />
                {result.unifiedReport.reasons.length > 0 && (
                  <ul className="text-xs text-slate-400 list-disc list-inside space-y-0.5 pt-1">
                    {result.unifiedReport.reasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                )}
              </div>
            )}

            {/* Phase 7 refinement: "present a receiving summary instead
                of requiring users to navigate elsewhere." Everything
                below comes straight from verifyByQr()'s own
                receivingSummary -- not re-derived or re-fetched. */}
            {result.receivingSummary && (
              <div className="rounded-xl p-4 bg-bg-elevated border border-border space-y-3">
                <p className="text-xs text-slate-400 flex items-center gap-1.5"><CheckCircle2 size={13} /> Receiving Summary</p>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Row icon={QrCode} label="Envelope ID" value={result.envelope.envelopeCode} />
                  <Row icon={ArrowRightLeft} label="Batch" value={result.receivingSummary.batch ? `${result.receivingSummary.batch.count} envelope(s)` : '—'} />
                  <Row icon={Search} label="Examination" value={result.receivingSummary.examination?.examName || '—'} />
                  <Row icon={Search} label="Subject" value={result.receivingSummary.examination?.subject || '—'} />
                  <Row icon={MapPin} label="Destination Centre" value={result.receivingSummary.examination?.centre || result.envelope.center} />
                  <Row icon={UserIcon} label="Verification Officer" value={user?.name || '—'} />
                  <Row icon={Clock} label="Verification Time" value={new Date().toLocaleString()} />
                  <Row
                    icon={Truck}
                    label="Transport Status"
                    value={result.receivingSummary.transportJustCompleted ? 'Delivered (just completed)' : result.envelope.transportStatus}
                  />
                  <Row icon={Cpu} label="AI Scanner Status" value={result.receivingSummary.aiScannerEnabled ? 'Enabled' : 'Not yet enabled'} />
                </div>

                {/* Phase 8: inline "Start AI Verification" -- no
                    navigation to the Envelope Scanner page. */}
                {!aiResult && (
                  <div className="pt-2 border-t border-border">
                    <button
                      onClick={() => aiFileInputRef.current?.click()}
                      disabled={aiScanning || !result.receivingSummary.aiScannerEnabled}
                      className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-bg font-medium rounded-xl px-4 py-2 text-sm"
                    >
                      {aiScanning ? <Loader2 size={15} className="animate-spin" /> : <Cpu size={15} />}
                      {aiScanning ? 'Scanning…' : 'Start AI Verification'}
                    </button>
                    <input
                      ref={aiFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleAiVerification(f); }}
                    />
                  </div>
                )}

                {aiResult && (
                  <div className="pt-3 border-t border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 flex items-center gap-1.5"><Cpu size={13} /> AI Verification Result</p>
                      <Badge variant={aiResult.envelope.sealStatus === 'SEALED' ? 'primary' : 'danger'} dot>
                        {aiResult.envelope.sealStatus === 'SEALED' ? 'Accepted' : formatLabel(aiResult.envelope.sealStatus)}
                      </Badge>
                    </div>
                    {aiResult.detections.map((d) => (
                      <div key={d.id} className="flex items-center justify-between text-xs bg-bg-card rounded-lg px-3 py-1.5">
                        <Badge variant={getDamageVariant(d.prediction)} dot>{formatLabel(d.prediction)}</Badge>
                        <span className="text-slate-500">{(d.confidence * 100).toFixed(0)}% confidence</span>
                      </div>
                    ))}
                    <p className="text-[11px] text-slate-600">
                      {aiResult.envelope.sealStatus === 'SEALED'
                        ? 'Recorded in Chain of Custody: AI Verified, Accepted.'
                        : 'Recorded in Chain of Custody: AI Verified. Not accepted — damage detected.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Part 8: GPS integration */}
            {result.envelope.gps ? (
              <div className="bg-bg-elevated rounded-xl p-4 space-y-2">
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-2"><Truck size={13} /> Live Transport</p>
                <Row icon={Truck} label="Vehicle" value={result.envelope.gps.vehicle?.vehicleNumber || '—'} />
                <Row icon={MapPin} label="Route" value={result.envelope.gps.route?.name || '—'} />
                <Row icon={Gauge} label="Speed" value={result.envelope.gps.latest?.speed != null ? `${result.envelope.gps.latest.speed.toFixed(1)} km/h` : '—'} />
                <Row icon={MapPin} label="Location" value={result.envelope.gps.latest ? `${result.envelope.gps.latest.latitude.toFixed(5)}, ${result.envelope.gps.latest.longitude.toFixed(5)}` : '—'} />
              </div>
            ) : (
              <p className="text-xs text-slate-500">No active transport session for this envelope.</p>
            )}

            {/* Part 9: AI integration */}
            {result.envelope.latestDetection ? (
              <div className="bg-bg-elevated rounded-xl p-4 space-y-2">
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-2"><Cpu size={13} /> Latest AI Scan</p>
                <div className="flex items-center gap-2">
                  <Badge variant={getDamageVariant(result.envelope.latestDetection.prediction)} dot>{formatLabel(result.envelope.latestDetection.prediction)}</Badge>
                  <span className="text-slate-400 text-xs">{(result.envelope.latestDetection.confidence * 100).toFixed(1)}% confidence</span>
                </div>
                <p className="text-xs text-slate-500">
                  Bounding box: x={result.envelope.latestDetection.boundingBox?.x?.toFixed(0)}, y={result.envelope.latestDetection.boundingBox?.y?.toFixed(0)},
                  w={result.envelope.latestDetection.boundingBox?.width?.toFixed(0)}, h={result.envelope.latestDetection.boundingBox?.height?.toFixed(0)}
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No AI scan recorded for this envelope yet.</p>
            )}

            <div className="flex gap-3 pt-2">
              {myPendingForThisEnvelope ? (
                <button onClick={openAccept} className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-bg font-medium rounded-xl px-4 py-2.5 text-sm">
                  <CheckCircle2 size={15} /> Accept Handover
                </button>
              ) : (
                <button onClick={openInitiate} className="inline-flex items-center gap-2 bg-bg-elevated border border-border hover:border-primary-500/30 text-slate-300 rounded-xl px-4 py-2.5 text-sm">
                  <ArrowRightLeft size={15} /> Initiate Handover
                </button>
              )}
            </div>
          </Card>

          {/* Part 3: Chain of Custody Timeline */}
          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4">Chain of Custody</h3>
            {history.length === 0 ? (
              <EmptyState icon={Clock} title="No events yet" description="This envelope has no recorded history." />
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {history.map((event) => (
                  <div key={event.id} className="border-l-2 border-primary-500/30 pl-3 py-1">
                    <p className="text-sm text-slate-200 font-medium">{EVENT_LABELS[event.eventType] || event.eventType}</p>
                    <p className="text-xs text-slate-500">{event.officer?.name} · {new Date(event.timestamp).toLocaleString()}</p>
                    {event.location && <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={10} /> {event.location}</p>}
                    {event.latitude != null && <p className="text-xs text-slate-600">{event.latitude.toFixed(5)}, {event.longitude.toFixed(5)}</p>}
                    {event.remarks && <p className="text-xs text-slate-500 italic">"{event.remarks}"</p>}
                    {event.eventType === 'HANDOVER' && (
                      <Badge variant={event.confirmed ? 'primary' : 'warning'} dot>{event.confirmed ? 'Confirmed' : 'Pending'}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal
        open={!!transferModal}
        onClose={() => setTransferModal(null)}
        title={transferModal === 'initiate' ? 'Initiate Handover' : 'Accept Handover'}
        footer={
          <div className="flex justify-end gap-3">
            <button onClick={() => setTransferModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200">Cancel</button>
            <button onClick={submitTransfer} disabled={transferBusy} className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-bg font-medium rounded-xl px-4 py-2 text-sm">
              {transferBusy && <Loader2 size={14} className="animate-spin" />} {transferModal === 'initiate' ? 'Send' : 'Confirm Accept'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {transferModal === 'initiate' && (
            <div>
              <label className="text-xs text-slate-500 mb-1.5 block">Receiving Officer</label>
              <select
                value={transferForm.toOfficerId}
                onChange={(e) => setTransferForm((f) => ({ ...f, toOfficerId: e.target.value }))}
                className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200"
              >
                <option value="">Select an officer</option>
                {officers.filter((o) => o.id !== user?.id).map((o) => (
                  <option key={o.id} value={o.id}>{o.name} — {o.role}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Location</label>
            <input
              value={transferForm.location}
              onChange={(e) => setTransferForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. District Treasury, Room 4"
              className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1.5 block">Remarks (optional)</label>
            <textarea
              value={transferForm.remarks}
              onChange={(e) => setTransferForm((f) => ({ ...f, remarks: e.target.value }))}
              rows={3}
              className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-slate-400">
      <Icon size={13} /> <span className="text-slate-500">{label}:</span> <span className="text-slate-200">{value}</span>
    </div>
  );
}
