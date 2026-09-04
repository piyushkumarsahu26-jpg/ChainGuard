import React from 'react';
import { statusColor } from '../../data/dummyData';

export default function StatusBadge({ status, className = '' }) {
  const c = statusColor[status] || statusColor.Sealed;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ring-1 ${c.text} ${c.bg} ${c.ring} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </span>
  );
}
