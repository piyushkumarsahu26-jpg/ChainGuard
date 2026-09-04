// frontend/src/pages/AIDetection.jsx
//
// AI Detection dashboard: model telemetry + live/paginated detection feed.
//
// Backend-connected:
//   - Detection Log table + Live Prediction Feed  -> GET /api/v1/detections
//   - Camera filter dropdown                       -> GET /api/v1/cameras (cameraService, reused from Dashboard work)
//   - Real-time updates                             -> Socket.IO events "detection:new" / "alert:new"
//
// Intentionally still using placeholder data (per instruction — do not
// invent APIs that don't exist yet):
//   - modelStats     (Model Version / Accuracy / Precision / Recall / Inference Time / GPU Utilization)
//   - accuracyTrend  (30-day accuracy line chart)
// Swap these for real service calls once a backend endpoint exists for them.
//
// UI/layout/styling is unchanged from the original file except for the new
// "Detection Log" card, which was required to satisfy search/filter/
// pagination — built by reusing the exact search-bar/select/button classes
// already established in AlertCenter.jsx, so it matches the existing design
// language rather than introducing a new one.

import React, { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, Zap, Cpu, Target, Crosshair, Timer, Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { modelStats, accuracyTrend } from '../data/dummyData'; // placeholders — no backend endpoint yet
import { useApp } from '../context/AppContext';
import aiDetectionService from '../services/aiDetectionService';
import cameraService from '../services/cameraService';
import { getSocket } from '../services/socket';

const LIMIT = 10;

/** "seal_tampered" -> "Seal Tampered" */
const formatLabel = (value) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

/**
 * Badge color for a detection's confidence score.
 * Mirrors the backend's own AUTO_ALERT_CONFIDENCE_THRESHOLD logic
 * (detection.service.js): >=0.9 -> CRITICAL, >=0.75 -> HIGH alert.
 * Using the same cutoffs here keeps the UI's visual severity consistent
 * with what actually triggers a real alert on the backend.
 */
const confidenceVariant = (confidence) => {
  if (confidence >= 0.9) return 'danger';
  if (confidence >= 0.75) return 'warning';
  return 'primary';
};

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');

export default function AIDetection() {
  const { pushToast } = useApp();

  // Most recent 5 detections, kept in sync via socket "detection:new" events
  // and reseeded whenever the paginated log reloads.
  const [liveFeed, setLiveFeed] = useState([]);

  // Paginated / filtered detection log.
  const [detections, setDetections] = useState({ items: [], meta: {} });

  // Populates the camera filter dropdown.
  const [cameras, setCameras] = useState([]);

  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');       // matches backend `prediction` filter (partial, case-insensitive)
  const [cameraFilter, setCameraFilter] = useState(''); // matches backend `cameraId` filter (exact)
  const [page, setPage] = useState(1);

  /**
   * Fetches the current page of detections using the active search/filter
   * state. `silent` suppresses the error toast for background refreshes
   * (e.g. triggered by a socket event) so a transient network hiccup
   * doesn't spam the user with duplicate toasts.
   */
  const loadDetections = useCallback(async ({ silent = false } = {}) => {
    try {
      const params = {
        page,
        limit: LIMIT,
        prediction: query || undefined,
        cameraId: cameraFilter || undefined,
      };
      const result = await aiDetectionService.getAll(params);
      setDetections(result);
      setLiveFeed(result.items.slice(0, 5));
    } catch (error) {
      console.error('AI Detection Error:', error);

      if (!silent) {
        pushToast({
          type: 'error',
          title: 'AI Detection Error',
          message: 'Failed to load detections.',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [page, query, cameraFilter, pushToast]);

  // Load the camera list once, for the filter dropdown.
  useEffect(() => {
    const loadCameras = async () => {
      try {
        const result = await cameraService.getAll();
        setCameras(result.items);
      } catch (error) {
        // Non-fatal — filter dropdown just stays empty ("All Cameras" only).
        console.error('Camera Filter Load Error:', error);
      }
    };
    loadCameras();
  }, []);

  // Debounced fetch whenever page/search/camera filter changes, so typing
  // in the search box doesn't fire a request on every keystroke.
  useEffect(() => {
    const timeout = setTimeout(() => {
      loadDetections();
    }, 350);
    return () => clearTimeout(timeout);
  }, [loadDetections]);

  // Real-time updates via Socket.IO.
  useEffect(() => {
    const socket = getSocket();

    // Fired for every new detection, regardless of confidence.
    const handleNewDetection = ({ detection }) => {
      setLiveFeed((prev) => [detection, ...prev].slice(0, 5));
      // Only silently refresh the paginated log if we're viewing the most
      // recent page — avoids yanking the user off whatever page they're
      // currently reviewing.
      if (page === 1) {
        loadDetections({ silent: true });
      }
    };

    // Fired only when a detection crosses the backend's alert threshold
    // (confidence >= 0.75) — i.e. this IS the "tampering" signal, since
    // there's no dedicated tampering flag on the Detection model itself.
    const handleNewAlert = ({ alert }) => {
      pushToast({
        type: 'error',
        title: 'Tampering Detected',
        message: alert?.title || 'A new high-priority alert was created.',
      });
      loadDetections({ silent: true });

      // AlertCenter.jsx manages its own local state and wasn't in scope
      // for this task, so instead of reaching into that file directly,
      // broadcast a DOM event any interested component can listen for.
      window.dispatchEvent(new CustomEvent('chainguard:alert-created', { detail: alert }));
    };

    socket.on('detection:new', handleNewDetection);
    socket.on('alert:new', handleNewAlert);

    return () => {
      socket.off('detection:new', handleNewDetection);
      socket.off('alert:new', handleNewAlert);
    };
  }, [page, loadDetections, pushToast]);

  // Static model telemetry — placeholder until a backend endpoint exists.
  const stats = [
    { label: 'Model Version', value: modelStats.version, icon: BrainCircuit },
    { label: 'Accuracy', value: `${modelStats.accuracy}%`, icon: Target },
    { label: 'Precision', value: `${modelStats.precision}%`, icon: Crosshair },
    { label: 'Recall', value: `${modelStats.recall}%`, icon: Zap },
    { label: 'Inference Time', value: `${modelStats.inferenceTimeMs}ms`, icon: Timer },
    { label: 'GPU Utilization', value: `${modelStats.gpuUtilization}%`, icon: Cpu },
  ];

  const totalPages = detections.meta?.totalPages || Math.max(1, Math.ceil((detections.meta?.total || 0) / LIMIT));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-400 text-sm">Loading AI detection data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">AI Detection</h1>
          <p className="text-slate-500 text-sm mt-1">Model performance and live inference telemetry.</p>
        </div>
        <button
          onClick={() => loadDetections()}
          className="inline-flex items-center gap-2 bg-bg-card border border-border rounded-xl px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:border-primary-500/30 transition-colors"
        >
          <RefreshCw size={15} /> Refresh data
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="w-9 h-9 rounded-lg bg-primary-500/10 text-primary-500 flex items-center justify-center mb-3">
              <s.icon size={16} />
            </div>
            <p className="text-lg font-semibold text-slate-100 font-mono">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-4">Model Accuracy — 30 day trend</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={accuracyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="day" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis domain={[95, 100]} stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(148,163,184,0.12)', borderRadius: 12, fontSize: 12 }} />
              <Line type="monotone" dataKey="accuracy" stroke="#38BDF8" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-100">Live Prediction Feed</h3>
            <Badge variant="primary" dot>Live</Badge>
          </div>
          <div className="space-y-3">
            {liveFeed.length === 0 ? (
              <p className="text-sm text-slate-500">No live detections yet.</p>
            ) : (
              liveFeed.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                  <div>
                    <p className="font-mono text-xs text-slate-300">{d.camera?.name || d.cameraId}</p>
                    <p className="text-xs text-slate-500">{(d.confidence * 100).toFixed(1)}% confidence</p>
                  </div>
                  <Badge variant={confidenceVariant(d.confidence)}>{formatLabel(d.prediction)}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-slate-100">Detection Log</h3>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
              placeholder="Search by prediction label..."
              className="w-full bg-bg-elevated border border-border rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <select
            value={cameraFilter}
            onChange={(e) => {
              setPage(1);
              setCameraFilter(e.target.value);
            }}
            className="bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          >
            <option value="">All Cameras</option>
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {detections.items.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">No detections found.</p>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-border">
                  <th className="py-2 pr-4 font-medium">Prediction</th>
                  <th className="py-2 pr-4 font-medium">Camera</th>
                  <th className="py-2 pr-4 font-medium">Confidence</th>
                  <th className="py-2 pr-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {detections.items.map((d) => (
                  <tr key={d.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="py-3 pr-4">
                      <Badge variant={confidenceVariant(d.confidence)}>{formatLabel(d.prediction)}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-slate-400">{d.camera?.name || d.cameraId}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-300">{(d.confidence * 100).toFixed(1)}%</td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(d.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
          <span>Page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex items-center gap-1 bg-bg-elevated border border-border rounded-xl px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex items-center gap-1 bg-bg-elevated border border-border rounded-xl px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}