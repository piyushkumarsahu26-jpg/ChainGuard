import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Truck, Camera as CameraIcon, Cpu, ArrowRightLeft, Users, Activity,
  Server, AlertTriangle, CheckCircle2, XCircle, TrendingUp, PackageSearch, Gauge,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { getSocket } from '../services/socket';
import dashboardService from '../services/dashboardService';
import alertService from '../services/alertService';
import gpsService from '../services/gpsService';
import cameraService from '../services/cameraService';
import aiDetectionService from '../services/aiDetectionService';
import custodyService from '../services/custodyService';
import systemService from '../services/systemService';

const damageVariant = { SAFE: 'primary', TORN: 'danger', OPENED: 'warning', CRUSHED: 'danger', TAPED: 'warning', PARTIAL_DAMAGE: 'warning' };
const getDamageVariant = (predictedClass) => damageVariant[(predictedClass || '').toUpperCase()] || 'neutral';
const formatLabel = (value) => (value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—');

// Real Node process health traffic-light -> a Badge variant. Same
// green/yellow/red vocabulary systemHealth.service.js's real checks
// already speak, just mapped to this project's existing Badge colors.
const HEALTH_VARIANT = { green: 'primary', yellow: 'warning', red: 'danger' };
const HEALTH_ICON = { green: CheckCircle2, yellow: AlertTriangle, red: XCircle };

function HealthRow({ label, health }) {
  const Icon = HEALTH_ICON[health?.status] || AlertTriangle;
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-slate-400">{label}</span>
      <span className={`flex items-center gap-1.5 ${health?.status === 'green' ? 'text-primary-500' : health?.status === 'yellow' ? 'text-warning' : 'text-danger'}`}>
        <Icon size={13} /> {health?.detail || 'Unknown'}
      </span>
    </div>
  );
}

export default function SecurityCommandCenter() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [systemHealth, setSystemHealth] = useState(null);
  const [aiHealth, setAiHealth] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [liveVehicles, setLiveVehicles] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [aiFeed, setAiFeed] = useState([]);
  const [recentTransfers, setRecentTransfers] = useState([]);

  const loadAll = useCallback(async () => {
    try {
      const [summaryRes, healthRes, aiHealthRes, alertsRes, liveRes, camerasRes, feedRes, transfersRes] = await Promise.all([
        dashboardService.getSummary(),
        systemService.getSystemHealth(),
        systemService.getAiHealth(),
        alertService.getAll({ status: 'OPEN', limit: 8 }),
        gpsService.getLive(),
        cameraService.getAll({ limit: 12 }),
        aiDetectionService.getAll({ limit: 8 }),
        custodyService.search({ dateFrom: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) }),
      ]);
      setSummary(summaryRes);
      setSystemHealth(healthRes);
      setAiHealth(aiHealthRes);
      setAlerts(alertsRes.items || []);
      setLiveVehicles(liveRes || []);
      setCameras(camerasRes.items || []);
      setAiFeed(feedRes.items || []);
      setRecentTransfers((transfersRes.items || []).filter((e) => e.eventType === 'HANDOVER_ACCEPTED').slice(0, 8));
    } catch (err) {
      console.error('Command Center load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // --- Real-time: the existing Socket.IO connection, not a new one.
  // Every event listed here already exists (Phase 1 through Sprint 8) —
  // this page just also listens, on top of whatever page-specific
  // listeners AIDetection.jsx/TransportMonitoring.jsx/etc. already have. ---
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => loadAll();

    socket.on('alert:new', refresh);
    socket.on('detection:new', refresh);
    socket.on('gps:update', refresh);
    socket.on('transport:start', refresh);
    socket.on('transport:pause', refresh);
    socket.on('transport:end', refresh);
    socket.on('camera:offline', refresh);
    socket.on('envelope:updated', refresh);

    // Real-time is debounced client-side (a light poll fallback every 20s)
    // rather than refetching on literally every gps:update tick (which
    // fires every 3s per active vehicle) — keeps this overview page
    // responsive without hammering 8 endpoints in a tight loop.
    const interval = setInterval(refresh, 20000);

    return () => {
      socket.off('alert:new', refresh);
      socket.off('detection:new', refresh);
      socket.off('gps:update', refresh);
      socket.off('transport:start', refresh);
      socket.off('transport:pause', refresh);
      socket.off('transport:end', refresh);
      socket.off('camera:offline', refresh);
      socket.off('envelope:updated', refresh);
      clearInterval(interval);
    };
  }, [loadAll]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-50 flex items-center gap-2">
          <Server size={22} className="text-primary-500" /> Security Command Center
        </h1>
        <p className="text-slate-500 text-sm mt-1">Every ChainGuard subsystem, one screen, updating live.</p>
      </div>

      {/* Part 9: Executive Dashboard cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
        <ExecCard icon={PackageSearch} label="Envelopes" value={summary?.totalEnvelopes ?? 0} />
        <ExecCard icon={Truck} label="Transport Active" value={summary?.transport?.activeTransportCount ?? 0} />
        <ExecCard icon={Truck} label="Vehicles" value={summary?.transport?.vehiclesOnline ?? 0} />
        <ExecCard icon={Users} label="Officers" value={recentTransfers.length > 0 ? new Set(recentTransfers.map((t) => t.officerId)).size : 0} />
        <ExecCard icon={Gauge} label="AI Accuracy" value={summary?.aiAccuracy != null ? `${summary.aiAccuracy}%` : 'N/A'} />
        <ExecCard icon={ShieldAlert} label="Alerts" value={summary?.tamperAlerts ?? 0} accent="danger" />
        <ExecCard icon={TrendingUp} label="High Risk" value={alerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length} accent="warning" />
        <ExecCard icon={CheckCircle2} label="Delivered" value={recentTransfers.length} accent="primary" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* System Health / AI Health */}
        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Server size={16} /> System Health</h3>
          <HealthRow label="Database" health={systemHealth?.database} />
          <HealthRow label="AI Service" health={systemHealth?.aiService} />
          <HealthRow label="Socket.IO" health={systemHealth?.socketIo} />
          <HealthRow label="Storage" health={systemHealth?.storage} />
          <HealthRow label="Memory" health={systemHealth?.memory} />
          <HealthRow label="CPU" health={systemHealth?.cpu} />
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Cpu size={16} /> AI Health</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Current model</span><span className="text-slate-200 font-mono text-xs">{aiHealth?.currentModel || '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">mAP50</span><span className="text-slate-200">{aiHealth?.modelMetrics ? `${(aiHealth.modelMetrics.mAP50 * 100).toFixed(1)}%` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Today's scans</span><span className="text-slate-200">{aiHealth?.todayScans ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Avg. confidence</span><span className="text-slate-200">{aiHealth?.averageConfidence != null ? `${(aiHealth.averageConfidence * 100).toFixed(1)}%` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Reachable</span><Badge variant={aiHealth?.reachable ? 'primary' : 'danger'} dot>{aiHealth?.reachable ? 'Yes' : 'No'}</Badge></div>
          </div>
        </Card>

        {/* Active Alerts */}
        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><ShieldAlert size={16} /> Active Alerts</h3>
          {alerts.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All clear" description="No open alerts." />
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm bg-bg-elevated rounded-lg px-3 py-2">
                  <span className="text-slate-300 truncate">{a.title}</span>
                  <Badge variant={a.severity === 'CRITICAL' || a.severity === 'HIGH' ? 'danger' : 'warning'} dot>{a.severity}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Live Vehicles */}
        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Truck size={16} /> Live Vehicles</h3>
          {liveVehicles.length === 0 ? (
            <EmptyState icon={Truck} title="No active transport" description="No vehicles currently in transit." />
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {liveVehicles.map(({ session, latestLocation }) => (
                <div key={session.id} className="text-sm bg-bg-elevated rounded-lg px-3 py-2">
                  <div className="flex justify-between"><span className="text-slate-200">{session.vehicle?.vehicleNumber}</span><Badge variant={session.status === 'ACTIVE' ? 'primary' : 'neutral'} dot>{session.status}</Badge></div>
                  <p className="text-xs text-slate-500">{latestLocation?.speed != null ? `${latestLocation.speed.toFixed(0)} km/h` : '—'} · {session.envelope?.envelopeCode}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Live Cameras */}
        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><CameraIcon size={16} /> Live Cameras</h3>
          {cameras.length === 0 ? (
            <EmptyState icon={CameraIcon} title="No cameras registered" description="Register a camera to see it here." />
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {cameras.map((cam) => (
                <div key={cam.id} className="text-sm bg-bg-elevated rounded-lg px-3 py-2">
                  <div className="flex justify-between"><span className="text-slate-200">{cam.name}</span><Badge variant={cam.status === 'ONLINE' ? 'primary' : 'danger'} dot>{cam.status}</Badge></div>
                  <p className="text-xs text-slate-500">{cam.fps != null ? `${cam.fps} FPS` : 'No FPS data'} · {cam.location || 'Unknown location'}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Transfers */}
        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><ArrowRightLeft size={16} /> Recent Transfers</h3>
          {recentTransfers.length === 0 ? (
            <EmptyState icon={ArrowRightLeft} title="No recent transfers" description="Handovers will appear here." />
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {recentTransfers.map((t) => (
                <div key={t.id} className="text-sm bg-bg-elevated rounded-lg px-3 py-2">
                  <p className="text-slate-200">{t.envelope?.envelopeCode}</p>
                  <p className="text-xs text-slate-500">{t.officer?.name} · {new Date(t.timestamp).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* AI Scan Feed */}
      <Card className="p-5">
        <h3 className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Activity size={16} /> AI Scan Feed</h3>
        {aiFeed.length === 0 ? (
          <EmptyState icon={Cpu} title="No scans yet" description="AI detections will appear here as they happen." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {aiFeed.map((d) => (
              <button
                key={d.id}
                onClick={() => d.envelope?.id && navigate(`/envelopes?id=${d.envelope.id}`)}
                className="text-left bg-bg-elevated rounded-xl p-3 hover:ring-1 hover:ring-primary-500/40 transition-shadow"
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={getDamageVariant(d.prediction)} dot>{formatLabel(d.prediction)}</Badge>
                  <span className="text-xs text-slate-500">{(d.confidence * 100).toFixed(0)}%</span>
                </div>
                <p className="text-xs text-slate-400">{d.envelope?.envelopeCode || 'Unknown envelope'}</p>
                <p className="text-[11px] text-slate-600">{new Date(d.timestamp).toLocaleString()}</p>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ExecCard({ icon: Icon, label, value, accent = 'primary' }) {
  const accentClasses = { primary: 'text-primary-500 bg-primary-500/10', warning: 'text-warning bg-warning/10', danger: 'text-danger bg-danger/10' };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-display font-semibold text-slate-50 mt-1">{value}</p>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accentClasses[accent]}`}>
          <Icon size={16} />
        </div>
      </div>
    </Card>
  );
}
