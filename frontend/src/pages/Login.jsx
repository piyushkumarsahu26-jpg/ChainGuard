import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ScanLine,
  ArrowRight,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function Login() {
  const navigate = useNavigate();
  const { login, pushToast } = useApp();

  const [email, setEmail] = useState('admin@chainguard.local');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);

      pushToast({
        type: 'success',
        title: 'Signed in',
        message: 'Welcome back to ChainGuard.',
      });

      navigate('/dashboard');
    } catch (error) {
      const message =
        error?.response?.data?.message ||
        'Invalid email or password.';

      pushToast({
        type: 'error',
        title: 'Login Failed',
        message,
      });

      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-bg px-4">
      {/* Animated background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-primary-500/10 blur-3xl animate-pulseGlow" />
        <div
          className="absolute -bottom-40 -right-40 w-[28rem] h-[28rem] rounded-full bg-accent/10 blur-3xl animate-pulseGlow"
          style={{ animationDelay: '1s' }}
        />
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.04]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0H0V40"
                fill="none"
                stroke="#38BDF8"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative w-full max-w-5xl grid lg:grid-cols-2 gap-10 items-center">
        {/* Illustration side */}
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden lg:flex flex-col gap-8"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-accent flex items-center justify-center shadow-glow">
              <ShieldCheck size={24} className="text-bg" />
            </div>
            <span className="font-display text-2xl font-semibold text-slate-50">
              ChainGuard
            </span>
          </div>

          <h1 className="font-display text-4xl font-semibold leading-tight text-slate-50">
            Every seal, <span className="text-gradient">watched end to end.</span>
          </h1>

          <p className="text-slate-400 max-w-md">
            AI vision tracks exam envelopes from the printing room to the exam
            hall, flagging tampering the instant it happens.
          </p>

          <div className="relative w-full max-w-md aspect-[4/3] rounded-2xl glass border border-border overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-40 h-28 rounded-lg border-2 border-primary-500/60 bg-bg-elevated flex items-center justify-center">
                <div className="absolute inset-2 border border-dashed border-primary-500/40 rounded" />
                <ScanLine size={28} className="text-primary-500" />
                <span className="absolute -bottom-7 text-xs text-primary-500 font-mono">
                  ENV-48213 · Sealed · 99.2%
                </span>
              </div>

              <motion.div
                className="absolute left-6 right-6 h-0.5 bg-primary-500/70 shadow-[0_0_12px_2px_rgba(34,197,94,0.6)]"
                animate={{ top: ['15%', '85%', '15%'] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              />
            </div>

            <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulseGlow" />
              LIVE · CAM-03
            </div>
          </div>
        </motion.div>

        {/* Form side */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md mx-auto glass border border-border rounded-2xl shadow-soft p-8"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent flex items-center justify-center">
              <ShieldCheck size={20} className="text-bg" />
            </div>
            <span className="font-display text-xl font-semibold text-slate-50">
              ChainGuard
            </span>
          </div>

          <h2 className="font-display text-2xl font-semibold text-slate-50">
            Sign in
          </h2>

          <p className="text-slate-500 text-sm mt-1 mb-6">
            Access the integrity monitoring console.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-slate-400 mb-1.5 block">
                Email
              </label>

              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  placeholder="admin@chainguard.local"
                />
              </div>
            </div>

            <div>
              <label className="text-sm text-slate-400 mb-1.5 block">
                Password
              </label>

              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                />

                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg-elevated border border-border rounded-xl pl-9 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  placeholder="••••••••"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center gap-2 text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-border bg-bg-elevated accent-primary-500"
                />
                Remember me
              </label>

              <button
                type="button"
                className="text-primary-400 hover:text-primary-500"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-500 hover:bg-primary-600 text-bg font-semibold rounded-xl py-2.5 flex items-center justify-center gap-2 transition-colors shadow-glow disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Sign in'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="text-xs text-slate-600 text-center mt-6">
            Use your administrator credentials to sign in.
          </p>
        </motion.div>
      </div>
    </div>
  );
}