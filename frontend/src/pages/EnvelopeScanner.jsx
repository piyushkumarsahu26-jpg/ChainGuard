import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  UploadCloud, X, Loader2, CheckCircle2, XCircle, RotateCcw,
  Clock, Cpu, ShieldAlert, ImageIcon, FileWarning,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import envelopeService from '../services/envelopeService';
import { getSocket } from '../services/socket';

// Matches upload.middleware.js's allowedMimeTypes, restricted to the image
// subset — this page scans envelope photos specifically; the backend also
// accepts video/pdf for other evidence types, out of scope here.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Matches MAX_UPLOAD_SIZE_MB's documented default (backend/.env.example).
// This is a client-side pre-check for a fast, friendly error — the
// backend's own Multer limit is still the actual enforcement point if
// this ever drifts out of sync with a deployment's real configured value.
const MAX_SIZE_MB = 10;

const damageVariant = {
  SAFE: 'primary',
  TORN: 'danger',
  OPENED: 'warning',
  CRUSHED: 'danger',
  TAPED: 'warning',
  PARTIAL_DAMAGE: 'warning',
};

// Case-insensitive lookup. Different trained models registered in
// services/model_registry.py over this project's history have returned
// different casings for the same concept (this project's own training
// platform used UPPERCASE — SAFE/TORN/...; a separately-trained model
// merged in later uses lowercase — sealed/torn/...). Normalizing here,
// once, is more robust than maintaining two duplicate key sets, and
// requires no change wherever `damageVariant` itself is read.
const getDamageVariant = (predictedClass) => damageVariant[(predictedClass || '').toUpperCase()] || 'neutral';

// Matches AIDetection.jsx's formatLabel exactly (same helper, kept local
// here rather than extracted to a shared module, consistent with this
// page's existing "keep it self-contained" style) — "sealed" -> "Sealed",
// "partial_damage" -> "Partial Damage", "SAFE" -> "SAFE" (already fine).
const formatDamageLabel = (value) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

const STATUS_LABEL = {
  uploading: 'Uploading…',
  processing: 'Processing…',
  inferring: 'Running AI inference…',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function validateFile(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Unsupported file type "${file.type || 'unknown'}". Please upload a JPEG, PNG, or WEBP image.`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `File is ${(file.size / (1024 * 1024)).toFixed(1)}MB, which exceeds the ${MAX_SIZE_MB}MB limit.`;
  }
  return null;
}

export default function EnvelopeScanner() {
  const { pushToast } = useApp();

  const [envelopes, setEnvelopes] = useState([]);
  const [envelopesLoading, setEnvelopesLoading] = useState(true);
  const [selectedEnvelopeId, setSelectedEnvelopeId] = useState('');

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState(null);

  const [status, setStatus] = useState('idle'); // idle | uploading | processing | inferring | completed | failed | cancelled
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [result, setResult] = useState(null);
  const [imageNaturalSize, setImageNaturalSize] = useState(null);

  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);
  const abortControllerRef = useRef(null);
  const inferringTimeoutRef = useRef(null);

  // --- Load the envelope list for the picker (reuses the existing
  // GET /envelopes endpoint — same service EnvelopeDetails.jsx uses) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEnvelopesLoading(true);
      try {
        const res = await envelopeService.getAll({ limit: 100 });
        if (cancelled) return;
        // Scanner receipt verification is self-contained: any registered
        // envelope can be selected. The backend validates the QR found in
        // this image against this exact selection before AI can run.
        const items = res.items || [];
        setEnvelopes(items);
        if (items.length > 0) setSelectedEnvelopeId(items[0].id);
      } catch (err) {
        console.error('Envelope list error:', err);
        pushToast({ type: 'error', title: 'Could not load envelopes', message: 'Refresh the page to try again.' });
      } finally {
        if (!cancelled) setEnvelopesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pushToast]);

  // --- Socket.IO: a progressive-enhancement layer, not the source of
  // truth. The awaited scan() promise (below) is what reliably drives
  // "completed"/"failed" — sockets can drop without the scan itself
  // failing (see socket.js's own comment on this). While a scan for the
  // currently-selected envelope is in flight, matching evidence:processed
  // events refine the displayed status text with real server-side detail. ---
  useEffect(() => {
    const socket = getSocket();

    const handler = (payload) => {
      if (!payload?.envelopeId || payload.envelopeId !== selectedEnvelopeId) return;
      if (status !== 'uploading' && status !== 'processing' && status !== 'inferring') return;

      if (payload.status === 'PROCESSING') {
        setStatus('processing');
      }
      // FAILED/COMPLETE from the socket are informational only here — the
      // scan() promise below (whose response carries the actual data this
      // page needs to render) is what sets the final status, so we don't
      // race the socket event against the HTTP response for the same
      // outcome.
    };

    socket.on('evidence:processed', handler);
    return () => socket.off('evidence:processed', handler);
  }, [selectedEnvelopeId, status]);

  // --- File selection / drag & drop -------------------------------------

  const applyFile = useCallback((candidate) => {
    if (!candidate) return;
    const error = validateFile(candidate);
    setValidationError(error);
    setResult(null);
    setStatus('idle');
    setErrorMessage(null);

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

    if (error) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(candidate);
    objectUrlRef.current = url;
    setFile(candidate);
    setPreviewUrl(url);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    applyFile(dropped);
  }, [applyFile]);

  const onBrowseChange = (e) => applyFile(e.target.files?.[0]);

  // --- Cleanup on unmount ---
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      if (inferringTimeoutRef.current) clearTimeout(inferringTimeoutRef.current);
      abortControllerRef.current?.abort();
    };
  }, []);

  // --- Scan submission ---------------------------------------------------

  const startScan = async () => {
    if (!file || !selectedEnvelopeId) return;

    setStatus('uploading');
    setUploadProgress(0);
    setErrorMessage(null);
    setResult(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await envelopeService.scan(selectedEnvelopeId, file, {
        signal: controller.signal,
        onUploadProgress: (evt) => {
          if (!evt.total) return;
          const pct = Math.round((evt.loaded / evt.total) * 100);
          setUploadProgress(pct);
          if (pct >= 100) {
            setStatus('processing');
            // No distinct backend event exists for "AI inference is now
            // running" specifically (evidence:processed only has
            // PROCESSING/FAILED/COMPLETE) — this timed transition is a
            // client-side UX approximation, not a real signal, documented
            // here so it isn't mistaken for one. Real measured inference
            // time (Sprint AI-3/4A) is ~700-1000ms on the current
            // smoke-test model, so 400ms is a reasonable "we're now past
            // the upload and DB-write step, probably into inference" cue.
            inferringTimeoutRef.current = setTimeout(() => setStatus('inferring'), 400);
          }
        },
      });

      if (inferringTimeoutRef.current) clearTimeout(inferringTimeoutRef.current);
      setResult(data);
      setStatus('completed');
      pushToast({ type: 'success', title: 'Scan complete', message: `${data.detections.length} finding(s), ${data.alerts.length} alert(s) raised.` });
    } catch (err) {
      if (inferringTimeoutRef.current) clearTimeout(inferringTimeoutRef.current);

      if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') {
        setStatus('cancelled');
        return;
      }

      console.error('Scan error:', err);
      const message = err?.response?.data?.message || err.message || 'The scan could not be completed.';
      setErrorMessage(message);
      setStatus('failed');
      pushToast({ type: 'error', title: 'Scan failed', message });
    } finally {
      abortControllerRef.current = null;
    }
  };

  const cancelUpload = () => {
    abortControllerRef.current?.abort();
  };

  const reset = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    setFile(null);
    setPreviewUrl(null);
    setValidationError(null);
    setStatus('idle');
    setResult(null);
    setErrorMessage(null);
    setImageNaturalSize(null);
  };

  const isBusy = status === 'uploading' || status === 'processing' || status === 'inferring';
  const selectedEnvelope = envelopes.find((e) => e.id === selectedEnvelopeId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-50">Envelope Scanner</h1>
        <p className="text-slate-500 text-sm mt-1">Upload a photo for on-demand AI integrity scanning.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* --- Left: envelope selection + upload --- */}
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4">1. Select Envelope</h3>
            {envelopesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : envelopes.length === 0 ? (
              <EmptyState icon={FileWarning} title="No registered envelopes" description="Create or register an envelope before scanning it." />
            ) : (
              <select
                value={selectedEnvelopeId}
                onChange={(e) => setSelectedEnvelopeId(e.target.value)}
                disabled={isBusy}
                className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:opacity-60"
              >
                {envelopes.map((e) => (
                  <option key={e.id} value={e.id}>{e.envelopeCode} — {e.exam} ({e.center})</option>
                ))}
              </select>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4">2. Upload Image</h3>

            {!previewUrl ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-xl py-14 px-6 cursor-pointer transition-colors ${
                  isDragging ? 'border-primary-500 bg-primary-500/5' : 'border-border hover:border-primary-500/40'
                }`}
              >
                <UploadCloud size={36} className={isDragging ? 'text-primary-500' : 'text-slate-500'} />
                <div className="text-center">
                  <p className="text-slate-300 text-sm font-medium">Drag & drop an envelope photo here</p>
                  <p className="text-slate-500 text-xs mt-1">or click to browse — JPEG, PNG, WEBP up to {MAX_SIZE_MB}MB</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_TYPES.join(',')}
                  className="hidden"
                  onChange={onBrowseChange}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative rounded-xl overflow-hidden border border-border bg-bg-elevated">
                  <img
                    src={previewUrl}
                    alt="Envelope preview"
                    onLoad={(e) => setImageNaturalSize({ width: e.target.naturalWidth, height: e.target.naturalHeight })}
                    className="w-full max-h-80 object-contain"
                  />
                  {!isBusy && status !== 'completed' && (
                    <button
                      onClick={reset}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-slate-200"
                      title="Remove file"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500 truncate">{file?.name} · {(file?.size / 1024).toFixed(0)} KB</p>
              </div>
            )}

            {validationError && (
              <p className="mt-3 text-sm text-danger flex items-center gap-1.5"><FileWarning size={14} /> {validationError}</p>
            )}

            {/* --- Status / progress --- */}
            {status !== 'idle' && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-300">
                    {isBusy && <Loader2 size={15} className="animate-spin text-primary-500" />}
                    {status === 'completed' && <CheckCircle2 size={15} className="text-primary-500" />}
                    {(status === 'failed' || status === 'cancelled') && <XCircle size={15} className="text-danger" />}
                    {STATUS_LABEL[status]}
                  </span>
                  {status === 'uploading' && <span className="text-slate-500">{uploadProgress}%</span>}
                </div>
                {status === 'uploading' && (
                  <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 transition-all duration-150" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
                {errorMessage && status === 'failed' && (
                  <p className="text-sm text-danger">{errorMessage}</p>
                )}
              </div>
            )}

            {/* --- Actions --- */}
            <div className="flex gap-3 mt-5">
              {!isBusy ? (
                <button
                  onClick={startScan}
                  disabled={!file || !!validationError || !selectedEnvelopeId || status === 'completed'}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-bg font-medium rounded-xl px-4 py-2.5 text-sm"
                >
                  <UploadCloud size={15} /> Start Scan
                </button>
              ) : (
                <button
                  onClick={cancelUpload}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-bg-elevated border border-border hover:border-danger/40 text-slate-300 hover:text-danger rounded-xl px-4 py-2.5 text-sm"
                >
                  <X size={15} /> Cancel
                </button>
              )}
              {(status === 'completed' || status === 'failed' || status === 'cancelled') && (
                <button
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 bg-bg-elevated border border-border rounded-xl px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100"
                >
                  <RotateCcw size={15} /> Scan Another
                </button>
              )}
            </div>
          </Card>
        </div>

        {/* --- Right: results --- */}
        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-4">3. Results</h3>

          {status !== 'completed' || !result ? (
            <EmptyState
              icon={ImageIcon}
              title="No scan results yet"
              description="Upload and scan an envelope image to see AI findings here."
            />
          ) : (
            <div className="space-y-5">
              {/* Original image with client-side bounding-box overlay.
                  The backend does not return a separately-rendered
                  annotated image for this flow (aiClient.service.js calls
                  /predict/image without save_annotated=true, and
                  envelope.service.js's scan() doesn't pass through
                  imageWidth/imageHeight) — modifying either is out of
                  scope for this phase ("do not modify the AI service /
                  existing backend orchestration"). Each Detection already
                  carries a real, precise boundingBox in the original
                  image's pixel space, so drawing the overlay client-side,
                  scaled against the preview <img>'s natural size (captured
                  via onLoad above), reproduces the same visual result
                  without needing a backend change. */}
              <div className="relative rounded-xl overflow-hidden border border-border bg-bg-elevated">
                <img src={previewUrl} alt="Scanned envelope" className="w-full max-h-72 object-contain" />
                {imageNaturalSize && (
                  <BoundingBoxOverlay detections={result.detections} naturalSize={imageNaturalSize} />
                )}
              </div>

              {/* Detected classes */}
              <div>
                <p className="text-xs text-slate-500 mb-2">Detected</p>
                {result.detections.length === 0 ? (
                  <p className="text-sm text-slate-400">No findings above the confidence threshold.</p>
                ) : (
                  <div className="space-y-2">
                    {result.detections.map((d) => (
                      <div key={d.id} className="flex items-center justify-between bg-bg-elevated rounded-lg px-3 py-2">
                        <Badge variant={getDamageVariant(d.prediction)} dot>{formatDamageLabel(d.prediction)}</Badge>
                        <span className="text-sm text-slate-300">{(d.confidence * 100).toFixed(1)}% confidence</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {result.alerts.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 ring-1 ring-danger/30 rounded-lg px-3 py-2.5">
                  <ShieldAlert size={16} />
                  {result.alerts.length} alert{result.alerts.length > 1 ? 's' : ''} raised — see Alert Center.
                </div>
              )}

              {/* Processing metadata */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-slate-400">
                  <Clock size={14} /> Processing time
                </div>
                <div className="text-slate-200 text-right">{result.aiProcessingTimeMs?.toFixed(0)} ms</div>
                <div className="flex items-center gap-2 text-slate-400">
                  <Cpu size={14} /> Model version
                </div>
                <div className="text-slate-200 text-right font-mono text-xs">{result.modelVersion}</div>
              </div>

              {/* Integration Sprint 3: the transport context auto-preloaded
                  from real backend data -- officer, vehicle, delivery
                  timestamp, location -- not entered manually. */}
              {result.transportContext && (
                <div className="bg-bg-elevated rounded-xl p-3 space-y-1.5">
                  <p className="text-xs text-slate-500 mb-1.5">Auto-preloaded from delivery</p>
                  <div className="grid grid-cols-2 gap-1.5 text-xs">
                    <span className="text-slate-500">Officer</span>
                    <span className="text-slate-300 text-right">{result.transportContext.officer?.name || '—'}</span>
                    <span className="text-slate-500">Vehicle</span>
                    <span className="text-slate-300 text-right">{result.transportContext.vehicle?.vehicleNumber || '—'}</span>
                    <span className="text-slate-500">Delivered</span>
                    <span className="text-slate-300 text-right">{result.transportContext.deliveredAt ? new Date(result.transportContext.deliveredAt).toLocaleString() : '—'}</span>
                    <span className="text-slate-500">Location</span>
                    <span className="text-slate-300 text-right">
                      {result.transportContext.location ? `${result.transportContext.location.latitude.toFixed(5)}, ${result.transportContext.location.longitude.toFixed(5)}` : '—'}
                    </span>
                  </div>
                </div>
              )}

              {/* Raw bounding box data */}
              {result.detections.length > 0 && (
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-300">Bounding box data</summary>
                  <pre className="mt-2 bg-bg-elevated rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(result.detections.map((d) => ({ class: d.prediction, boundingBox: d.boundingBox })), null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

/**
 * Draws each detection's boundingBox (pixel coordinates in the ORIGINAL
 * image) as an absolutely-positioned overlay, scaled to however the
 * preview <img> is actually being rendered (which can differ from the
 * natural size due to the `object-contain`/`max-h-*` CSS above). Uses
 * percentage-based positioning so it stays correctly aligned across
 * resizes without a resize-observer.
 */
function BoundingBoxOverlay({ detections, naturalSize }) {
  if (!detections?.length || !naturalSize?.width || !naturalSize?.height) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {detections.map((d) => {
        const box = d.boundingBox || {};
        if (typeof box.x !== 'number') return null;
        const left = (box.x / naturalSize.width) * 100;
        const top = (box.y / naturalSize.height) * 100;
        const width = (box.width / naturalSize.width) * 100;
        const height = (box.height / naturalSize.height) * 100;
        const variant = getDamageVariant(d.prediction);
        const color = variant === 'danger' ? '#F87171' : variant === 'warning' ? '#FBBF24' : '#38BDF8';

        return (
          <div
            key={d.id}
            className="absolute border-2 rounded-sm"
            style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, borderColor: color }}
          >
            <span
              className="absolute -top-5 left-0 text-[10px] px-1.5 py-0.5 rounded font-medium whitespace-nowrap"
              style={{ backgroundColor: color, color: '#0B1220' }}
            >
              {formatDamageLabel(d.prediction)} {(d.confidence * 100).toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
