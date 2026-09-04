import React from 'react';

export default function Skeleton({ className = '' }) {
  return <div className={`shimmer-bg rounded-lg ${className}`} />;
}
