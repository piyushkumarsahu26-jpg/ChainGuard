import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

const iconFor = { success: CheckCircle2, warning: AlertTriangle, info: Info, danger: AlertTriangle };
const colorFor = { success: 'text-primary-500', warning: 'text-warning', info: 'text-accent', danger: 'text-danger' };

export default function ToastContainer() {
  const { toasts, dismissToast } = useApp();

  return createPortal(
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-3 w-[min(360px,90vw)]">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = iconFor[t.type] || Info;
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className="glass rounded-xl shadow-soft border border-border p-4 flex items-start gap-3"
            >
              <Icon size={18} className={`${colorFor[t.type] || 'text-accent'} mt-0.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-100">{t.title}</p>
                {t.message && <p className="text-xs text-slate-400 mt-0.5">{t.message}</p>}
              </div>
              <button onClick={() => dismissToast(t.id)} className="text-slate-500 hover:text-slate-200">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}
