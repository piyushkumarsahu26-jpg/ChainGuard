import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { getSocket } from '../services/socket';
import analyticsService from '../services/analyticsService';

const COLORS = ['#F87171', '#FBBF24', '#38BDF8', '#22C55E', '#A78BFA', '#FB923C', '#2DD4BF'];
const tooltipStyle = { background: '#111827', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 12, fontSize: 12 };

const statusChipVariant = {
  ONLINE: 'primary',
  OFFLINE: 'danger',
  DEGRADED: 'warning',
  MAINTENANCE: 'warning',
};

function ChartCard({ title, loading, empty, emptyDescription, children }) {
  return (
    <Card className="p-5">
      <h3 className="font-display font-semibold text-slate-100 mb-4">{title}</h3>
      {loading ? (
        <Skeleton className="h-[260px] w-full" />
      ) : empty ? (
        <EmptyState icon={BarChart3} title="No data yet" description={emptyDescription} />
      ) : (
        children
      )}
    </Card>
  );
}

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [scansByMonth, setScansByMonth] = useState([]);
  const [tamperBreakdown, setTamperBreakdown] = useState([]);
  const [confidenceTrend, setConfidenceTrend] = useState([]);
  const [centerRisk, setCenterRisk] = useState([]);
  const [cameraStatus, setCameraStatus] = useState([]);
  const [qrAnalytics, setQrAnalytics] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scans, tamper, confidence, centers, cameras, qr] = await Promise.all([
        analyticsService.getScansByMonth(),
        analyticsService.getTamperBreakdown(),
        analyticsService.getConfidenceTrend(30),
        analyticsService.getCenterRisk(),
        analyticsService.getCameraStatus(),
        analyticsService.getQrAnalytics(),
      ]);
      setScansByMonth(scans);
      setTamperBreakdown(tamper);
      setConfidenceTrend(confidence);
      setCenterRisk(centers);
      setCameraStatus(cameras);
      setQrAnalytics(qr);
    } catch (err) {
      console.error('Analytics Error:', err);
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Integration Sprint 3: "refresh... Analytics... in real time" -- this
  // page had no socket listeners of any kind before. Same debounced
  // pattern as Dashboard.jsx (Integration Sprint 2): a scan producing a
  // new detection, or a transport session starting/ending, are exactly
  // the events that change what these charts show (tamper breakdown,
  // confidence trend, center risk), so a full reload is the correct
  // response, just not on every single tick.
  useEffect(() => {
    const socket = getSocket();
    let debounceHandle = null;
    const refreshSoon = () => {
      if (debounceHandle) return;
      debounceHandle = setTimeout(() => {
        debounceHandle = null;
        load();
      }, 2000);
    };

    socket.on('detection:new', refreshSoon);
    socket.on('evidence:processed', refreshSoon);
    socket.on('alert:new', refreshSoon);
    socket.on('transport:start', refreshSoon);
    socket.on('transport:end', refreshSoon);
    socket.on('envelope:updated', refreshSoon);

    return () => {
      socket.off('detection:new', refreshSoon);
      socket.off('evidence:processed', refreshSoon);
      socket.off('alert:new', refreshSoon);
      socket.off('transport:start', refreshSoon);
      socket.off('transport:end', refreshSoon);
      socket.off('envelope:updated', refreshSoon);
      if (debounceHandle) clearTimeout(debounceHandle);
    };
  }, [load]);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">Trends and patterns across the entire monitoring network.</p>
        </div>
        <Card className="p-5">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load analytics"
            description={error}
            action={<button onClick={load} className="text-sm text-primary-400 hover:text-primary-500">Try again</button>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-50">Analytics</h1>
        <p className="text-slate-500 text-sm mt-1">Trends and patterns across the entire monitoring network.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <ChartCard
          title="Detection Volume by Month"
          loading={loading}
          empty={!loading && scansByMonth.length === 0}
          emptyDescription="No AI detections have been recorded yet."
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={scansByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="month" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="scans" fill="#38BDF8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Tamper Type Breakdown"
          loading={loading}
          empty={!loading && tamperBreakdown.length === 0}
          emptyDescription="No AI detections have been recorded yet."
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={tamperBreakdown} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={3}>
                {tamperBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Average Detection Confidence (30 days)"
          loading={loading}
          empty={!loading && confidenceTrend.length === 0}
          emptyDescription="No AI detections have been recorded in the last 30 days."
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={confidenceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 100]} stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(1)}%`} />
              <Line type="monotone" dataKey="avgConfidence" stroke="#22C55E" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Most Affected Centers"
          loading={loading}
          empty={!loading && centerRisk.length === 0}
          emptyDescription="No alerts have been linked to an exam center yet."
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={centerRisk} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal={false} />
              <XAxis type="number" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="center" stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} width={140} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="incidents" fill="#F87171" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/*
        Replaces the old "Camera Uptime Heatmap". There is no historical
        uptime data stored anywhere in the schema (no CameraStatusHistory
        table), so rather than fabricate an uptime percentage, this shows
        the real, current status of every camera.
      */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-slate-100">Live Camera Status</h3>
          <Badge variant="primary">Live</Badge>
        </div>
        {loading ? (
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
          </div>
        ) : cameraStatus.length === 0 ? (
          <EmptyState icon={BarChart3} title="No cameras registered yet" />
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
            {cameraStatus.map((c) => (
              <div key={c.id} className="flex flex-col items-center gap-2">
                <div className="w-full aspect-square rounded-lg flex items-center justify-center">
                  <Badge variant={statusChipVariant[c.status] || 'neutral'} dot>{c.status}</Badge>
                </div>
                <span className="text-[11px] text-slate-500 text-center truncate w-full">{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* QR Verification & Digital Authentication sprint (Phase 8) */}
      <Card className="p-5">
        <h3 className="font-display font-semibold text-slate-100 mb-4">QR Verification Activity</h3>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
        ) : !qrAnalytics || qrAnalytics.totalScans === 0 ? (
          <EmptyState icon={BarChart3} title="No QR activity yet" description="Scan or verify an envelope's QR to see activity here." />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Scans', value: qrAnalytics.totalScans },
                { label: 'Successful', value: qrAnalytics.successfulVerifications, accent: 'primary' },
                { label: 'Failed', value: qrAnalytics.failedVerifications, accent: qrAnalytics.failedVerifications > 0 ? 'danger' : undefined },
                { label: 'Duplicates', value: qrAnalytics.duplicateScans, accent: qrAnalytics.duplicateScans > 0 ? 'warning' : undefined },
                { label: 'Tampered', value: qrAnalytics.tamperedAttempts, accent: qrAnalytics.tamperedAttempts > 0 ? 'danger' : undefined },
                { label: 'Route Violations', value: qrAnalytics.routeViolations, accent: qrAnalytics.routeViolations > 0 ? 'warning' : undefined },
              ].map((s) => (
                <div key={s.label} className="bg-bg-elevated rounded-xl p-3 text-center">
                  <p className={`text-xl font-display font-semibold ${s.accent === 'danger' ? 'text-danger' : s.accent === 'warning' ? 'text-warning' : s.accent === 'primary' ? 'text-primary-500' : 'text-slate-100'}`}>{s.value}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {qrAnalytics.officerPerformance?.length > 0 && (
              <div className="mt-5">
                <p className="text-xs text-slate-500 mb-2">Officer Performance</p>
                <div className="space-y-1.5">
                  {qrAnalytics.officerPerformance.map((row) => (
                    <div key={row.officer?.id || Math.random()} className="flex items-center justify-between text-sm bg-bg-elevated rounded-lg px-3 py-2">
                      <span className="text-slate-300">{row.officer?.name || 'Unknown officer'}</span>
                      <span className="text-slate-500 text-xs">{row.scanCount} scan{row.scanCount === 1 ? '' : 's'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
