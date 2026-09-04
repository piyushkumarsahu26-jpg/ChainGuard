import React, { useCallback, useEffect, useState } from 'react';
import { QrCode, Download, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import PreparationConfirmationDialog from '../components/ui/PreparationConfirmationDialog';
import { useApp } from '../context/AppContext';
import examinationService from '../services/examinationService';
import envelopeBatchService from '../services/envelopeBatchService';

const PREP_STATUS_LABELS = {
  QR_GENERATED: 'QR Generated', QR_PRINTED: 'QR Printed', QR_ATTACHED: 'QR Attached',
  PACKED: 'Packed', SEALED: 'Sealed', READY_FOR_DISPATCH: 'Ready for Dispatch',
};
const PREP_STATUS_VARIANT = {
  QR_GENERATED: 'neutral', QR_PRINTED: 'neutral', QR_ATTACHED: 'warning',
  PACKED: 'warning', SEALED: 'warning', READY_FOR_DISPATCH: 'primary',
};

// Phase 2/3/4 (Architectural Integration sprint). Deliberately a
// separate page from QR Verification -- generating identities and
// verifying them at receipt are different real-world moments, done by
// different people, per the sprint's own explicit instruction.
export default function QRGeneration() {
  const { pushToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [examinations, setExaminations] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [count, setCount] = useState(25);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [batches, setBatches] = useState([]);
  const [activeBatch, setActiveBatch] = useState(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await examinationService.getAll({ limit: 100 });
      const items = result.items || [];
      setExaminations(items);
      if (items.length > 0 && !selectedExamId) {
        setSelectedExamId(items[0].id);
        setCount(items[0].envelopeCount || 25);
      }
    } catch (err) {
      console.error('QR Generation load error:', err);
      pushToast({ type: 'error', title: 'Could not load examinations', message: 'Refresh the page to try again.' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToast]);

  useEffect(() => { load(); }, [load]);

  const loadBatchesForExam = useCallback(async (examId) => {
    if (!examId) { setBatches([]); return; }
    try {
      const result = await envelopeBatchService.listForExamination(examId);
      setBatches(result || []);
    } catch (err) {
      console.error('Load batches error:', err);
    }
  }, []);

  useEffect(() => { loadBatchesForExam(selectedExamId); }, [selectedExamId, loadBatchesForExam]);

  const handleGenerate = async () => {
    if (!selectedExamId || !count || count < 1) {
      pushToast({ type: 'error', title: 'Select an examination', message: 'Choose an examination and a valid envelope count.' });
      return;
    }
    setGenerating(true);
    try {
      const { batch, envelopes } = await envelopeBatchService.generateBatch({ examinationId: selectedExamId, count: Number(count) });
      pushToast({ type: 'success', title: 'QR batch generated', message: `${envelopes.length} envelope(s), each with a unique signed QR.` });
      const fresh = await envelopeBatchService.getById(batch.id);
      setActiveBatch(fresh);
      await loadBatchesForExam(selectedExamId);
    } catch (err) {
      console.error('Generate batch error:', err);
      pushToast({ type: 'error', title: 'Could not generate batch', message: err?.response?.data?.message || err.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = async (batch) => {
    setDownloading(true);
    try {
      const blob = await envelopeBatchService.downloadPdf(batch.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qr-stickers-${batch.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushToast({ type: 'success', title: 'PDF downloaded', message: 'Print-ready QR sticker sheet — cut and attach to each envelope.' });
      const fresh = await envelopeBatchService.getById(batch.id);
      setActiveBatch(fresh);
      await loadBatchesForExam(selectedExamId);
    } catch (err) {
      console.error('Download PDF error:', err);
      pushToast({ type: 'error', title: 'Could not generate PDF', message: err?.response?.data?.message || err.message });
    } finally {
      setDownloading(false);
    }
  };

  const refreshActiveBatch = async () => {
    if (!activeBatch) return;
    const fresh = await envelopeBatchService.getById(activeBatch.id);
    setActiveBatch(fresh);
    await loadBatchesForExam(selectedExamId);
  };

  const selectedExam = examinations.find((e) => e.id === selectedExamId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-50 flex items-center gap-2">
          <QrCode size={22} className="text-primary-500" /> QR Generation
        </h1>
        <p className="text-slate-500 text-sm mt-1">Generate secure, individually-signed QR identities for an examination's envelopes.</p>
      </div>

      <Card className="p-6">
        {loading ? (
          <Skeleton className="h-24" />
        ) : examinations.length === 0 ? (
          <EmptyState icon={QrCode} title="No examinations yet" description="Create one on the Examination Setup page first." />
        ) : (
          <div className="grid sm:grid-cols-3 gap-4 items-end">
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500 mb-1 block">Examination</label>
              <select
                value={selectedExamId}
                onChange={(e) => {
                  setSelectedExamId(e.target.value);
                  const exam = examinations.find((x) => x.id === e.target.value);
                  setCount(exam?.envelopeCount || 25);
                  setActiveBatch(null);
                }}
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-slate-200"
              >
                {examinations.map((exam) => (
                  <option key={exam.id} value={exam.id}>{exam.examName} — {exam.subject} ({exam.centre})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Number of Envelopes</label>
              <input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-slate-200"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-bg font-medium rounded-xl px-5 py-2.5 text-sm"
              >
                {generating ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                {generating ? 'Generating…' : 'Generate QR Batch'}
              </button>
              {selectedExam && <span className="text-xs text-slate-500 ml-3">Each envelope gets its own unique QR, UUID, and digital signature — never one shared QR.</span>}
            </div>
          </div>
        )}
      </Card>

      {activeBatch && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display font-semibold text-slate-100">Batch generated — {activeBatch.envelopes?.length ?? 0} envelope(s)</h3>
              <p className="text-xs text-slate-500 mt-1">{activeBatch.examination?.examName} · {activeBatch.examination?.centre}</p>
            </div>
            <Badge variant={PREP_STATUS_VARIANT[activeBatch.envelopes?.[0]?.prepStatus] || 'neutral'} dot>
              {PREP_STATUS_LABELS[activeBatch.envelopes?.[0]?.prepStatus] || activeBatch.envelopes?.[0]?.prepStatus}
            </Badge>
          </div>

          {/* Phase 3: Printing */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => handleDownloadPdf(activeBatch)}
              disabled={downloading}
              className="inline-flex items-center gap-2 bg-bg-elevated border border-border hover:border-primary-500/30 text-slate-300 rounded-xl px-4 py-2 text-sm disabled:opacity-40"
            >
              {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              {downloading ? 'Preparing PDF…' : 'Download / Print QR Sticker Sheet (PDF)'}
            </button>
            {activeBatch.printCount > 0 && (
              <span className="text-xs text-slate-500">
                Printed {activeBatch.printCount} time{activeBatch.printCount === 1 ? '' : 's'}
                {activeBatch.lastPrintedAt ? ` · last ${new Date(activeBatch.lastPrintedAt).toLocaleString()}` : ''}
              </span>
            )}
          </div>

          {/* Phase 4: the explicit preparation confirmation -- never
              implied by printing alone. */}
          {activeBatch.printCount > 0 && activeBatch.envelopes?.[0]?.prepStatus !== 'READY_FOR_DISPATCH' && (
            <button
              onClick={() => setConfirmDialogOpen(true)}
              className="inline-flex items-center gap-2 bg-warning/10 border border-warning/30 hover:bg-warning/20 text-warning rounded-xl px-4 py-2 text-sm"
            >
              <ShieldCheck size={15} /> Confirm Preparation Complete
            </button>
          )}
          {activeBatch.envelopes?.[0]?.prepStatus === 'READY_FOR_DISPATCH' && (
            <p className="text-sm text-primary-500 flex items-center gap-2"><CheckCircle2 size={15} /> Ready for Dispatch — proceed on the Live GPS page.</p>
          )}

          <div className="pt-2 border-t border-border">
            <p className="text-xs text-slate-500 mb-2">Envelopes in this batch</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(activeBatch.envelopes || []).map((env) => (
                <div key={env.id} className="bg-bg-elevated rounded-lg px-3 py-2 text-xs text-slate-300 flex items-center justify-between">
                  <span>{env.envelopeCode}</span>
                  <Badge variant={PREP_STATUS_VARIANT[env.prepStatus] || 'neutral'} dot>{PREP_STATUS_LABELS[env.prepStatus] || env.prepStatus}</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="font-display font-semibold text-slate-100 mb-4">Previous Batches for This Examination</h3>
        {batches.length === 0 ? (
          <EmptyState icon={QrCode} title="No batches yet" description="Generate one above." />
        ) : (
          <div className="space-y-2">
            {batches.map((batch) => (
              <button
                key={batch.id}
                onClick={async () => setActiveBatch(await envelopeBatchService.getById(batch.id))}
                className="w-full text-left bg-bg-elevated hover:bg-white/5 rounded-xl px-4 py-3 flex items-center justify-between"
              >
                <span className="text-sm text-slate-300">{batch.envelopes?.length ?? batch.count} envelope(s) · {new Date(batch.createdAt).toLocaleString()}</span>
                <span className="text-xs text-slate-500">{batch.printCount > 0 ? `Printed ${batch.printCount}×` : 'Not printed yet'}</span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <PreparationConfirmationDialog
        open={confirmDialogOpen}
        onClose={() => setConfirmDialogOpen(false)}
        batch={activeBatch}
        onConfirmed={refreshActiveBatch}
      />
    </div>
  );
}
