import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { Search, Bell, ChevronDown, LogOut, User, Settings as SettingsIcon, Menu, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../../context/AppContext';
import alertService from '../../services/alertService';

const labelMap = {
  dashboard: 'Dashboard',
  monitoring: 'Live Monitoring',
  envelopes: 'Envelope Details',
  alerts: 'Alert Center',
  analytics: 'Analytics',
  cameras: 'Camera Management',
  'ai-detection': 'AI Detection',
  reports: 'Reports',
  settings: 'Settings',
};

// Derives display initials from a full name, e.g. "Piyush Sahu" -> "PS",
// "John" -> "J". Falls back to "U" when no usable name is available.
const getInitials = (name) => {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return 'U';
  }

  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
};

// Sprint 8, Part 10 (Notification Center): infers a display category from
// fields Alert already has — no new schema field needed. detectionId set
// -> AI (every AI-originated alert has one, detection.service.js);
// cameraId set with a CAMERA_* category -> Camera; the six Sprint 5/6
// GPS-related categories -> GPS; anything else falls to System. "QR" has
// no alert-generating code path yet (custody.service.js's verifyByQr is
// deliberately read-only, per its own Sprint 7 comment) — so it's a
// real, available filter option with no alerts to show yet, not a
// hidden gap.
function categorizeAlert(alert) {
  if (alert.detectionId) return 'AI';
  if (alert.category === 'CAMERA_OFFLINE' || alert.category === 'CAMERA_LOW_FPS') return 'Camera';
  // QR Verification & Digital Authentication sprint: these 5 categories
  // didn't exist when this function was written (Sprint 8) -- its own
  // comment at the time noted "QR" was a real, available filter with no
  // alerts to show yet, not a hidden gap. They exist now.
  if (['INVALID_QR', 'SIGNATURE_FAILURE', 'DUPLICATE_SCAN', 'EXPIRED_QR', 'UNKNOWN_ENVELOPE', 'WRONG_CENTRE'].includes(alert.category)) return 'QR';
  if (['ROUTE_DEVIATION', 'VEHICLE_STOPPED', 'LATE_ARRIVAL', 'GPS_SIGNAL_LOST', 'BATTERY_LOW', 'CHECKPOINT_MISSED'].includes(alert.category)) return 'GPS';
  return 'System';
}

export default function Navbar({ onOpenMobileNav }) {
  const { user, logout, pushToast } = useApp();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [openAlertItems, setOpenAlertItems] = useState([]);
  const [openAlertCount, setOpenAlertCount] = useState(0);
  const [notifReadFilter, setNotifReadFilter] = useState('unread'); // 'unread' | 'read' | 'all'
  const [notifPriorityFilter, setNotifPriorityFilter] = useState('all');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const loadOpenAlerts = async () => {
      try {
        const params = { limit: 20 };
        if (notifReadFilter === 'unread') params.status = 'OPEN';
        else if (notifReadFilter === 'read') params.status = 'RESOLVED';
        if (notifPriorityFilter !== 'all') params.severity = notifPriorityFilter;

        const result = await alertService.getAll(params);
        if (cancelled) return;
        setOpenAlertItems(result.items || []);
        // The badge count is always the real *unread* total, independent
        // of whatever filter the open dropdown currently has selected —
        // switching to "Read" shouldn't make the badge disappear.
        if (notifReadFilter === 'unread' && notifPriorityFilter === 'all') {
          setOpenAlertCount(result.meta?.total ?? (result.items || []).length);
        }
      } catch (err) {
        // Non-fatal: the bell just won't show a live count. The rest of
        // the app (Alert Center itself) still works via its own fetch.
        console.error('Navbar alert count error:', err);
      }
    };

    loadOpenAlerts();
    return () => { cancelled = true; };
  }, [notifReadFilter, notifPriorityFilter]);

  // The badge's real unread count, fetched once independently of
  // whatever filter is selected in the (possibly closed) dropdown.
  useEffect(() => {
    let cancelled = false;
    alertService.getAll({ status: 'OPEN', limit: 1 }).then((result) => {
      if (!cancelled) setOpenAlertCount(result.meta?.total ?? 0);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const markAsRead = async (alertId, e) => {
    e.stopPropagation();
    try {
      await alertService.resolve(alertId);
      setOpenAlertItems((prev) => prev.filter((a) => a.id !== alertId));
      setOpenAlertCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Mark as read error:', err);
    }
  };

  const crumbs = location.pathname.split('/').filter(Boolean);

  return (
    <header className="h-16 shrink-0 border-b border-border bg-bg-card/60 backdrop-blur-xl flex items-center gap-4 px-4 lg:px-6 relative z-30">
      <button
        onClick={onOpenMobileNav}
        className="lg:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:bg-white/5"
      >
        <Menu size={20} />
      </button>

      <div className="hidden md:flex items-center gap-1.5 text-sm text-slate-500">
        <Link to="/dashboard" className="hover:text-slate-300">ChainGuard</Link>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight size={14} />
            <span className="text-slate-300 capitalize">{labelMap[c] || c}</span>
          </span>
        ))}
      </div>

      <div className="flex-1 max-w-md ml-0 md:ml-4 relative hidden sm:block">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search envelope ID, camera, officer..."
          className="w-full bg-bg-elevated border border-border rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 hover:bg-white/5 relative"
          >
            <Bell size={19} />
            {openAlertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-danger animate-pulseGlow" />
            )}
          </button>
          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-0 mt-2 w-96 glass rounded-xl border border-border shadow-soft overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-100">Notifications</span>
                  <span className="text-xs text-danger">{openAlertCount} unread</span>
                </div>
                <div className="px-4 py-2.5 border-b border-border flex flex-wrap gap-1.5">
                  {['unread', 'read', 'all'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setNotifReadFilter(f)}
                      className={`px-2.5 py-1 rounded-full text-[11px] capitalize ${notifReadFilter === f ? 'bg-primary-500 text-bg font-medium' : 'bg-bg-elevated text-slate-400 hover:text-slate-200'}`}
                    >
                      {f}
                    </button>
                  ))}
                  <span className="w-px bg-border mx-0.5" />
                  {['all', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => (
                    <button
                      key={p}
                      onClick={() => setNotifPriorityFilter(p)}
                      className={`px-2.5 py-1 rounded-full text-[11px] capitalize ${notifPriorityFilter === p ? 'bg-primary-500 text-bg font-medium' : 'bg-bg-elevated text-slate-400 hover:text-slate-200'}`}
                    >
                      {p === 'all' ? 'Any priority' : p}
                    </button>
                  ))}
                </div>
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  {openAlertItems.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-500 text-center">No notifications match this filter.</p>
                  ) : (
                    openAlertItems.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          setNotifOpen(false);
                          navigate('/alerts');
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-border/60 last:border-0 group"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wide text-primary-400 bg-primary-500/10 rounded-full px-1.5 py-0.5">{categorizeAlert(a)}</span>
                          {a.status === 'OPEN' && (
                            <span
                              onClick={(e) => markAsRead(a.id, e)}
                              className="text-[10px] text-slate-500 hover:text-primary-400 opacity-0 group-hover:opacity-100"
                            >
                              Mark read
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-200 mt-1">{a.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.camera?.name || a.envelope?.envelopeCode || 'System'} · {new Date(a.createdAt).toLocaleString()}
                        </p>
                      </button>
                    ))
                  )}
                </div>
                <Link
                  to="/alerts"
                  onClick={() => setNotifOpen(false)}
                  className="block text-center text-xs text-primary-400 py-2.5 hover:bg-white/5"
                >
                  View all alerts
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-white/5"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent flex items-center justify-center text-xs font-semibold text-bg">
              {getInitials(user?.name)}
            </div>
            <span className="hidden md:block text-sm text-slate-200">{user?.name || 'User'}</span>
            <ChevronDown size={14} className="text-slate-500 hidden md:block" />
          </button>
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="absolute right-0 mt-2 w-56 glass rounded-xl border border-border shadow-soft overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-sm font-medium text-slate-100">{user?.name || 'User'}</p>
                  <p className="text-xs text-slate-500">{user?.role || 'Unknown'}</p>
                </div>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5"
                >
                  <User size={15} /> Profile
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-300 hover:bg-white/5"
                >
                  <SettingsIcon size={15} /> Settings
                </button>
                <button
                  onClick={() => {
                    logout();
                    pushToast({ type: 'info', title: 'Signed out', message: 'See you again soon.' });
                    navigate('/login');
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger hover:bg-white/5 border-t border-border"
                >
                  <LogOut size={15} /> Sign out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}