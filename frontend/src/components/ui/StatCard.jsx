import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import Card from './Card';

function useCountUp(target, duration = 1200, decimals = 0) {
  const [value, setValue] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    let raf;
    const step = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const progress = Math.min((timestamp - startRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value.toFixed(decimals);
}

export default function StatCard({ icon: Icon, label, value, decimals = 0, suffix = '', trend, accent = 'primary' }) {
  const display = useCountUp(value, 1200, decimals);
  const accentClasses = {
    primary: 'text-primary-500 bg-primary-500/10',
    accent: 'text-accent bg-accent/10',
    warning: 'text-warning bg-warning/10',
    danger: 'text-danger bg-danger/10',
  };

  return (
    <Card hover className="p-5 relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-400 text-sm">{label}</p>
          <p className="text-3xl font-display font-semibold mt-2 tabular-nums text-slate-50">
            {display}
            <span className="text-lg text-slate-400">{suffix}</span>
          </p>
          {trend && (
            <p className={`text-xs mt-2 ${trend.startsWith('-') ? 'text-danger' : 'text-primary-500'}`}>
              {trend} vs yesterday
            </p>
          )}
        </div>
        {Icon && (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accentClasses[accent]}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      <div className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-primary-500/5 group-hover:bg-primary-500/10 transition-colors" />
    </Card>
  );
}
