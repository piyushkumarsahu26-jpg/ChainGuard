import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-bg text-center px-4">
      <ShieldAlert size={40} className="text-primary-500 mb-4" />
      <h1 className="font-display text-3xl font-semibold text-slate-50">Page not found</h1>
      <p className="text-slate-500 mt-2 max-w-sm">The page you're looking for doesn't exist or has moved.</p>
      <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-bg font-medium rounded-xl px-5 py-2.5 text-sm">
        Back to Dashboard
      </Link>
    </div>
  );
}
