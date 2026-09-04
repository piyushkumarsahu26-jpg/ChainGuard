// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { Video, PackageSearch, ShieldAlert, ScanLine, Gauge, Cpu, Database, RefreshCw, FileText, Camera as CameraIcon, Truck, Navigation, Activity, Clock, Route } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Card from '../components/ui/Card';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import { dailyScans } from '../data/dummyData';
import { useApp } from '../context/AppContext';
import dashboardService from '../services/dashboardService';
import cameraService from '../services/cameraService';
import activityService from '../services/activityService';
import { getSocket } from '../services/socket';

export default function Dashboard() {
  const { user, pushToast } = useApp();

  const [summary, setSummary] = useState({
    totalEnvelopes: 0,
    activeCameras: 0,
    tamperAlerts: 0,
    todayScans: 0,
    aiAccuracy: 0,
    transport: { vehiclesOnline: 0, activeTransportCount: 0, averageSpeed: 0, liveAlerts: 0, gpsSignalStatus: 'NO_ACTIVE_TRANSPORT', vehiclesDelayed: 0, vehiclesOffRoute: 0 },
  });

  const [cameraData, setCameraData] = useState({
    items: [],
    meta: {},
  });

  const [activityData, setActivityData] = useState([]);

  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    try {
      const [summaryData, cameras, activity] = await Promise.all([
        dashboardService.getSummary(),
        cameraService.getAll(),
        activityService.getRecent(),
      ]);
      setSummary(summaryData);
      setCameraData(cameras);
      setActivityData(activity);
    } catch (error) {
      console.error('Dashboard Error:', error);

      pushToast({
        type: 'error',
        title: 'Dashboard Error',
        message: 'Failed to load dashboard data.',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Integration Sprint 2: "notify the Dashboard... through existing
  // real-time events" -- this page had no socket listeners at all
  // before. Reuses the exact same events Security Command Center
  // already listens for (Sprint 8), not a new event or a new socket
  // connection. gps:update fires every ~3s per active vehicle, so a
  // light debounce avoids re-fetching the whole summary on every single
  // tick -- the dashboard's own figures (vehicle/session counts, average
  // speed) don't need sub-second precision the way the live map does.
  useEffect(() => {
    const socket = getSocket();
    let debounceHandle = null;
    const refreshSoon = () => {
      if (debounceHandle) return;
      debounceHandle = setTimeout(() => {
        debounceHandle = null;
        loadDashboard();
      }, 2000);
    };

    socket.on('transport:start', refreshSoon);
    socket.on('transport:pause', refreshSoon);
    socket.on('transport:end', refreshSoon);
    socket.on('gps:update', refreshSoon);
    socket.on('envelope:updated', refreshSoon);
    socket.on('alert:new', refreshSoon);
    socket.on('detection:new', refreshSoon);
    socket.on('evidence:processed', refreshSoon);

    return () => {
      socket.off('transport:start', refreshSoon);
      socket.off('transport:pause', refreshSoon);
      socket.off('transport:end', refreshSoon);
      socket.off('gps:update', refreshSoon);
      socket.off('envelope:updated', refreshSoon);
      socket.off('alert:new', refreshSoon);
      socket.off('detection:new', refreshSoon);
      socket.off('evidence:processed', refreshSoon);
      if (debounceHandle) clearTimeout(debounceHandle);
    };
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-400 text-sm">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">
            Good morning, {user?.name?.split(' ')[0] || 'Admin'}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Here's what's happening across the exam supply chain today.</p>
        </div>
        <button
          onClick={() => pushToast({ type: 'success', title: 'Data refreshed', message: 'All feeds are up to date.' })}
          className="inline-flex items-center gap-2 bg-bg-card border border-border rounded-xl px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:border-primary-500/30 transition-colors"
        >
          <RefreshCw size={15} /> Refresh data
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard icon={CameraIcon} label="Active Cameras" value={summary.activeCameras} suffix={`/${cameraData.meta.total || 0}`} trend="+1" accent="primary" />
        <StatCard icon={PackageSearch} label="Envelopes Tracked" value={summary.totalEnvelopes} trend="+124" accent="accent" />
        <StatCard icon={ShieldAlert} label="Tamper Alerts" value={summary.tamperAlerts} trend="+3" accent="danger" />
        <StatCard icon={ScanLine} label="Today's Scans" value={summary.todayScans} trend="+8.2%" accent="primary" />
        <StatCard icon={Gauge} label="AI Accuracy" value={summary.aiAccuracy ?? 0} decimals={1} suffix="%" trend="+0.2%" accent="accent" />
      </div>

      {/* Sprint 5/6 extension — Transport Monitoring dashboard widgets.
          A second, separate grid row rather than inserted into the row
          above: keeps the original 5 cards completely untouched (no
          reordering, no shared state), and groups the transport-specific
          figures together for a reader scanning the page. Sourced from
          dashboardService.getSummary()'s new `transport` field, which
          delegates to gps.service.js's getDashboardStats() — no new
          endpoint, the existing /dashboard/summary contract just grew an
          additive field (Sprint 6 added vehiclesDelayed/vehiclesOffRoute
          to that same field, still no new endpoint). Seven cards now
          wrap to two rows within this same grid — acceptable, not worth
          a third grid just for two more cards. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <StatCard icon={Truck} label="Vehicles Online" value={summary.transport?.vehiclesOnline ?? 0} accent="primary" />
        <StatCard icon={Navigation} label="Active Transport" value={summary.transport?.activeTransportCount ?? 0} accent="accent" />
        <StatCard icon={ShieldAlert} label="Live Alerts" value={summary.transport?.liveAlerts ?? 0} accent="danger" />
        <StatCard icon={Clock} label="Vehicles Delayed" value={summary.transport?.vehiclesDelayed ?? 0} accent="warning" />
        <StatCard icon={Route} label="Vehicles Off Route" value={summary.transport?.vehiclesOffRoute ?? 0} accent="danger" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-100">Scan volume — last 7 days</h3>
            <Badge variant="primary">Live</Badge>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailyScans}>
              <defs>
                <linearGradient id="scanGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="tamperGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F87171" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="day" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: '#E2E8F0' }}
              />
              <Area type="monotone" dataKey="scans" stroke="#22C55E" fill="url(#scanGradient)" strokeWidth={2} />
              <Area type="monotone" dataKey="tampered" stroke="#F87171" fill="url(#tamperGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-4">System Health</h3>
          <div className="space-y-4">
            {[
              { label: 'Detection Engine', value: 98, icon: Cpu },
              { label: 'Database Sync', value: 100, icon: Database },
              { label: 'Camera Network', value: 92, icon: Video },
              { label: 'Report Pipeline', value: 96, icon: FileText },
            ].map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="flex items-center gap-2 text-slate-400"><s.icon size={14} /> {s.label}</span>
                  <span className="text-slate-300 font-mono">{s.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
                  <div
                    className={`h-full rounded-full ${s.value > 95 ? 'bg-primary-500' : 'bg-accent'}`}
                    style={{ width: `${s.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-4">Recent Activity</h3>
          {activityData.length === 0 ? (
            <p className="text-sm text-slate-500">No recent activity available.</p>
          ) : (
            <ol className="relative border-l border-border ml-2">
              {activityData.map((a, i) => (
                <li key={a.id ?? i} className="mb-5 ml-5 last:mb-0">
                  <span
                    className={`absolute -left-[7px] w-3 h-3 rounded-full ring-4 ring-bg-card ${
                      a.tag === 'alert' ? 'bg-danger' : a.tag === 'scan' ? 'bg-primary-500' : 'bg-accent'
                    }`}
                  />
                  <p className="text-sm text-slate-200">{a.text}</p>
                  <p className="text-xs text-slate-500">{new Date(a.time).toLocaleString()}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4">Camera Status</h3>
            <div className="space-y-3">
              {cameraData.items.slice(0, 4).map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{c.name}</span>
                  <Badge variant={c.status === 'ONLINE' ? 'primary' : c.status === 'OFFLINE' ? 'danger' : 'warning'}>
                    {c.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'View Alerts', icon: ShieldAlert },
                { label: 'Live Feeds', icon: Video },
                { label: 'Generate Report', icon: FileText },
                { label: 'Camera Setup', icon: CameraIcon },
              ].map((q) => (
                <button
                  key={q.label}
                  className="flex flex-col items-center gap-2 py-3 rounded-xl bg-bg-elevated hover:bg-white/5 border border-border text-xs text-slate-300 transition-colors"
                >
                  <q.icon size={18} className="text-primary-500" />
                  {q.label}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}