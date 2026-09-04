import React, { useState } from 'react';
import { CheckSquare, Square, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import { useApp } from '../../context/AppContext';
import envelopeBatchService from '../../services/envelopeBatchService';

// Architectural Integration sprint (Phase 4 refinement, the user's
// explicit correction): printing a QR sticker sheet must never silently
// imply that the stickers were attached, the envelopes packed, or
// sealed. This dialog is the one place those three physical steps get
// confirmed -- a real checklist, not a single "OK" button dressed up as
// one, and the Confirm action stays disabled until every item is
// checked. Reusable: any page that generates/prints a batch can render
// this once the batch exists (envelopeBatch.controller.js's
// confirm-preparation endpoint is the only thing this calls).
const CHECKLIST_ITEMS = [
  { key: 'attached', label: 'QR stickers have been attached to every envelope in this batch' },
  { key: 'packed', label: 'Question papers have been packed into every envelope' },
  { key: 'sealed', label: 'Every envelope has been physically sealed' },
];

export default function PreparationConfirmationDialog({ open, onClose, batch, onConfirmed }) {
  const { pushToast } = useApp();
  const [checked, setChecked] = useState({});
  const [confirming, setConfirming] = useState(false);

  const allChecked = CHECKLIST_ITEMS.every((item) => checked[item.key]);

  const toggle = (key) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleConfirm = async () => {
    if (!allChecked || !batch) return;
    setConfirming(true);
    try {
      const result = await envelopeBatchService.confirmPreparation(batch.id);
      pushToast({
        type: 'success',
        title: 'Preparation confirmed',
        message: `${result.readyCount} of ${result.envelopeCount} envelope(s) are now Ready for Dispatch.`,
      });
      setChecked({});
      onConfirmed?.(result);
      onClose?.();
    } catch (err) {
      console.error('Confirm preparation error:', err);
      pushToast({ type: 'error', title: 'Could not confirm preparation', message: err?.response?.data?.message || err.message });
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    setChecked({});
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Confirm Preparation Complete"
      size="md"
      footer={
        <>
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-100 hover:bg-white/5"
          >
            Not yet
          </button>
          <button
            onClick={handleConfirm}
            disabled={!allChecked || confirming}
            className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-bg font-medium rounded-xl px-4 py-2 text-sm"
          >
            <ShieldCheck size={15} /> {confirming ? 'Confirming…' : 'Confirm Preparation'}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-400 mb-4">
        Printing the QR sticker sheet does not by itself mean these envelopes are ready — confirm each step has
        actually been completed{batch ? ` for all ${batch.envelopes?.length ?? batch.count ?? ''} envelope(s) in this batch` : ''}.
      </p>
      <div className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => toggle(item.key)}
            className="w-full flex items-center gap-3 text-left bg-bg-elevated hover:bg-white/5 rounded-xl px-3 py-2.5 text-sm text-slate-200"
          >
            {checked[item.key] ? <CheckSquare size={18} className="text-primary-500 shrink-0" /> : <Square size={18} className="text-slate-500 shrink-0" />}
            {item.label}
          </button>
        ))}
      </div>
      {!allChecked && (
        <p className="text-xs text-slate-500 mt-3">Check every item above to enable confirmation.</p>
      )}
    </Modal>
  );
}
