import React from 'react';

const variants = {
  neutral: 'bg-slate-500/10 text-slate-300 ring-slate-500/20',
  primary: 'bg-primary-500/10 text-primary-500 ring-primary-500/30',
  accent: 'bg-accent/10 text-accent ring-accent/30',
  warning: 'bg-warning/10 text-warning ring-warning/30',
  danger: 'bg-danger/10 text-danger ring-danger/30',
};

const dotColors = {
  neutral: 'bg-slate-400',
  primary: 'bg-primary-500',
  accent: 'bg-accent',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export default function Badge({ children, variant = 'neutral', dot = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${variants[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}
