import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Video,
  FileSearch,
  ShieldAlert,
  BarChart3,
  Camera,
  BrainCircuit,
  ScanLine,
  Navigation,
  QrCode,
  Server as ServerIcon,
  FileText,
  Settings,
  ShieldCheck,
  Users,
  GraduationCap,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Order matches the sprint's own requested navigation exactly:
// Dashboard, Command Center, Examination Setup, QR Generation, Envelope
// Details, Live GPS, QR Verification, Envelope Scanner, Live
// Monitoring, Alert Center, Analytics, Reports, Camera Management, AI
// Detection, Settings.
const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/command-center', label: 'Command Center', icon: ServerIcon },
  { to: '/examination-setup', label: 'Examination Setup', icon: GraduationCap },
  { to: '/qr-generation', label: 'QR Generation', icon: QrCode },
  { to: '/envelopes', label: 'Envelope Details', icon: FileSearch },
  { to: '/transport', label: 'Live GPS', icon: Navigation },
  { to: '/qr-verification', label: 'QR Verification', icon: ShieldCheck },
  { to: '/scanner', label: 'Envelope Scanner', icon: ScanLine },
  { to: '/monitoring', label: 'Live Monitoring', icon: Video },
  { to: '/alerts', label: 'Alert Center', icon: ShieldAlert },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/cameras', label: 'Camera Management', icon: Camera },
  { to: '/ai-detection', label: 'AI Detection', icon: BrainCircuit },
  { to: '/settings', label: 'Settings', icon: Settings },
];

// Rendered separately from navItems (rather than folded in with a role
// condition per-item) since it's the only entry gated by role — keeping
// the existing array untouched for every other item.
const adminNavItem = { to: '/admin/users', label: 'Administration', icon: Users };

export default function Sidebar() {
  const { sidebarCollapsed, setSidebarCollapsed, user } = useApp();
  const items = user?.role === 'ADMINISTRATOR' ? [...navItems, adminNavItem] : navItems;

  return (
    <aside
      className={`hidden lg:flex flex-col shrink-0 border-r border-border bg-bg-card/60 backdrop-blur-xl transition-all duration-200 ${
        sidebarCollapsed ? 'w-[76px]' : 'w-64'
      }`}
    >
      <div className="h-16 flex items-center gap-2 px-4 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-accent flex items-center justify-center shrink-0 shadow-glow">
          <ShieldCheck size={18} className="text-bg" />
        </div>
        {!sidebarCollapsed && (
          <span className="font-display font-semibold text-lg tracking-tight text-slate-50">ChainGuard</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4 px-3 flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-500/10 text-primary-400 ring-1 ring-primary-500/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
              }`
            }
            title={sidebarCollapsed ? label : undefined}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary-500" />
                )}
                <Icon size={18} className="shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setSidebarCollapsed((c) => !c)}
        className="m-3 flex items-center justify-center gap-2 py-2 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors text-sm"
      >
        {sidebarCollapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
      </button>
    </aside>
  );
}
