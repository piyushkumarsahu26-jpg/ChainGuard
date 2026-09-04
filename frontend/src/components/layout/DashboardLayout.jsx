import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, ShieldCheck } from 'lucide-react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import ToastContainer from '../ui/Toast';
import {
  LayoutDashboard, Video, FileSearch, ShieldAlert, BarChart3, Camera, BrainCircuit, FileText, Settings,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/monitoring', label: 'Live Monitoring', icon: Video },
  { to: '/envelopes', label: 'Envelope Details', icon: FileSearch },
  { to: '/alerts', label: 'Alert Center', icon: ShieldAlert },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/cameras', label: 'Camera Management', icon: Camera },
  { to: '/ai-detection', label: 'AI Detection', icon: BrainCircuit },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-bg">
      <Sidebar />

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="relative w-64 h-full bg-bg-card border-r border-border flex flex-col"
            >
              <div className="h-16 flex items-center justify-between px-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent flex items-center justify-center">
                    <ShieldCheck size={18} className="text-bg" />
                  </div>
                  <span className="font-display font-semibold text-lg text-slate-50">ChainGuard</span>
                </div>
                <button onClick={() => setMobileOpen(false)} className="text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1">
                {navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                        isActive ? 'bg-primary-500/10 text-primary-400' : 'text-slate-400 hover:bg-white/5'
                      }`
                    }
                  >
                    <Icon size={18} />
                    {label}
                  </NavLink>
                ))}
              </nav>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="p-4 md:p-6 max-w-[1600px] mx-auto"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
