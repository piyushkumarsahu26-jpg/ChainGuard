// frontend/src/pages/LiveMonitoring.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { Maximize2, Wifi, WifiOff, Gauge, Clock } from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useApp } from '../context/AppContext';
import cameraService from '../services/cameraService';
import aiDetectionService from '../services/aiDetectionService';
import alertService from '../services/alertService';
import gpsService from '../services/gpsService';
import { getSocket } from '../services/socket';

// Mirrors the enum-to-badge mapping already used on Dashboard/AlertCenter/AIDetection.
const cameraStatusVariant = (status) => {
  if (status === 'ONLINE') return 'primary';
  if (status === 'OFFLINE') return 'danger';
  return 'warning'; // DEGRADED / MAINTENANCE
};

// Same thresholds as detection.service.js's AUTO_ALERT_CONFIDENCE_THRESHOLD
// (0.75 -> HIGH alert, 0.9 -> CRITICAL), reused from AIDetection.jsx's logic
// so severity coloring is consistent across the app.
const confidenceVariant = (confidence) => {
  if (confidence >= 0.9) return 'danger';
  if (confidence >= 0.75) return 'warning';
  return 'primary';
};

const formatLabel = (value) =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');

// Shortens a camera name for the cramped thumbnail header only.
// e.g. "Camera 05 - Exam Center Storage Room" -> "Camera 05"
// Falls back to a hard character truncation if there's no " - " delimiter.
const getShortName = (name) => {
  if (!name) return 'Camera';
  const [firstPart] = name.split(' - ');
  return firstPart.length > 16 ? `${firstPart.slice(0, 16)}…` : firstPart;
};

function CameraFeed({ camera, detection, large = false }) {
  const offline = camera.status !== 'ONLINE';
  return (
    <Card className={`relative overflow-hidden ${large ? 'aspect-video' : 'aspect-video'} group`}>
      <div className="absolute inset-0 bg-gradient-to-br from-bg-elevated to-[#0a1120]" />
      {/* faux grain / grid to suggest camera feed */}
      <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id={`gridcam-${camera.id}`} width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M24 0H0V24" fill="none" stroke="#38BDF8" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#gridcam-${camera.id})`} />
      </svg>

      {offline ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
          <WifiOff size={28} />
          <span className="text-sm">{formatLabel(camera.status)}</span>
        </div>
      ) : (
        large && detection && (
          <div
            className="absolute border-2 border-primary-500 rounded-md shadow-[0_0_16px_2px_rgba(34,197,94,0.4)]"
            style={{ top: '32%', left: '38%', width: '26%', height: '38%' }}
          >
            <span className="absolute -top-6 left-0 text-[10px] font-mono bg-primary-500 text-bg px-1.5 py-0.5 rounded">
              {formatLabel(detection.prediction)} · {(detection.confidence * 100).toFixed(1)}%
            </span>
          </div>
        )
      )}

      <div className="absolute left-0 right-0 h-0.5 bg-primary-500/60 animate-scan pointer-events-none" style={{ display: offline ? 'none' : 'block' }} />

      <div className="absolute top-2 left-2 flex items-center gap-1.5 text-[11px] font-mono text-slate-300 bg-black/40 px-2 py-1 rounded-md">
        {offline ? <WifiOff size={11} /> : <Wifi size={11} className="text-primary-500" />}
        {large ? `${camera.id} · ${camera.name}` : getShortName(camera.name)}
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-black/40 px-2 py-1 rounded-md">
        <Gauge size={11} /> {camera.fps ?? '—'} FPS
      </div>
      <button className="absolute bottom-2 right-2 w-7 h-7 rounded-md bg-black/40 flex items-center justify-center text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
        <Maximize2 size={14} />
      </button>
      {large && detection && (
        <div className="absolute bottom-2 left-2 text-[11px] font-mono text-slate-300 bg-black/40 px-2 py-1 rounded-md flex items-center gap-1.5">
          <Clock size={11} /> {formatDate(detection.timestamp)}
        </div>
      )}
    </Card>
  );
}

export default function LiveMonitoring() {
  const { pushToast } = useApp();

  const [cameras, setCameras] = useState([]);
  const [detections, setDetections] = useState([]);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  // Integration Sprint 2: this page had zero GPS/transport awareness
  // before -- a real gap, given this is the page an operator watches for
  // "what's happening right now," which should include active transport,
  // not just cameras. A small additive widget (below), not a duplicate
  // of TransportMonitoring.jsx's own full map/timeline/simulator page.
  const [activeTransport, setActiveTransport] = useState([]);

  const selected = cameras.find((c) => c.id === selectedId) || cameras[0] || null;
  const selectedDetection = selected
    ? detections.find((d) => d.cameraId === selected.id)
    : null;

  const loadAll = useCallback(async () => {
    try {
      const [cameraResult, detectionResult, alertResult, liveTransport] = await Promise.all([
        cameraService.getAll({ limit: 100 }),
        aiDetectionService.getAll({ limit: 50 }),
        alertService.getAll(),
        gpsService.getLive(),
      ]);

      setCameras(cameraResult.items);
      setDetections(detectionResult.items);
      setActiveTransport(liveTransport || []);

      const openAlert = alertResult.items.find((a) => a.status === 'OPEN') || null;
      setCurrentAlert(openAlert);

      setSelectedId((prev) => prev || cameraResult.items[0]?.id || null);
    } catch (error) {
      console.error('Live Monitoring Error:', error);

      pushToast({
        type: 'error',
        title: 'Live Monitoring Error',
        message: 'Failed to load live monitoring data.',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const socket = getSocket();

    // Only real-time camera event the backend emits (camera.service.js) —
    // fires solely on the ONLINE -> OFFLINE transition.
    const handleCameraOffline = ({ camera }) => {
      setCameras((prev) => prev.map((c) => (c.id === camera.id ? { ...c, ...camera } : c)));
    };

    const handleNewDetection = ({ detection }) => {
      setDetections((prev) => [detection, ...prev].slice(0, 50));
    };

    const handleNewAlert = ({ alert }) => {
      if (alert?.status === 'OPEN') {
        setCurrentAlert(alert);
        pushToast({
          type: 'error',
          title: 'Tampering Detected',
          message: alert?.title || 'A new high-priority alert was created.',
        });
      }
    };

    socket.on('camera:offline', handleCameraOffline);
    socket.on('detection:new', handleNewDetection);
    socket.on('alert:new', handleNewAlert);

    // Integration Sprint 2: refresh the active-transport widget on the
    // same real events every other page now reuses -- a full refetch
    // (not a partial patch) since transport start/end changes the
    // *set* of active sessions, not one field on an existing one.
    const handleTransportChange = () => {
      gpsService.getLive().then(setActiveTransport).catch(() => {});
    };
    socket.on('transport:start', handleTransportChange);
    socket.on('transport:pause', handleTransportChange);
    socket.on('transport:end', handleTransportChange);

    return () => {
      socket.off('camera:offline', handleCameraOffline);
      socket.off('detection:new', handleNewDetection);
      socket.off('alert:new', handleNewAlert);
      socket.off('transport:start', handleTransportChange);
      socket.off('transport:pause', handleTransportChange);
      socket.off('transport:end', handleTransportChange);
    };
  }, [pushToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-400 text-sm">Loading live monitoring...</p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-400 text-sm">No cameras available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">Live Monitoring</h1>
          <p className="text-slate-500 text-sm mt-1">Real-time AI detection across all active feeds.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="primary" dot>
            {cameras.filter((c) => c.status === 'ONLINE').length} feeds live
          </Badge>
          {activeTransport.length > 0 && (
            <Badge variant="accent" dot>
              {activeTransport.length} vehicle{activeTransport.length > 1 ? 's' : ''} in transit
            </Badge>
          )}
        </div>
      </div>

      {activeTransport.length > 0 && (
        <Card className="p-4">
          <p className="text-xs text-slate-500 mb-3">Active Transport</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeTransport.map(({ session, latestLocation }) => (
              <div key={session.id} className="bg-bg-elevated rounded-xl px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-200">{session.vehicle?.vehicleNumber}</span>
                  <Badge variant={session.status === 'ACTIVE' ? 'primary' : 'neutral'} dot>{session.status}</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {session.envelope?.envelopeCode} · {latestLocation?.speed != null ? `${latestLocation.speed.toFixed(0)} km/h` : '—'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">
          <div onClick={() => {}} className="cursor-default">
            <CameraFeed camera={selected} detection={selectedDetection} large />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {cameras.map((c) => (
              <button key={c.id} onClick={() => setSelectedId(c.id)} className="text-left">
                <div className={`rounded-xl ring-2 transition-all ${selected.id === c.id ? 'ring-primary-500' : 'ring-transparent'}`}>
                  <CameraFeed camera={c} detection={detections.find((d) => d.cameraId === c.id)} />
                </div>
                <p className="text-xs text-slate-400 mt-1 truncate">{c.name}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {currentAlert && (
            <Card className="p-5 border-danger/30 ring-1 ring-danger/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-danger">Current Alert</span>
                <Badge variant="danger">{formatLabel(currentAlert.severity)}</Badge>
              </div>
              <p className="text-slate-200 text-sm font-medium">{currentAlert.title}</p>
              <p className="text-xs text-slate-500 mt-1">{currentAlert.description || 'No description available.'}</p>
              <p className="text-xs text-slate-500 mt-2">{currentAlert.camera?.name || '—'} · {formatDate(currentAlert.createdAt)}</p>
            </Card>
          )}

          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4">Camera Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Name</span><span className="text-slate-200">{selected.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Location</span><span className="text-slate-200 text-right">{selected.location || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Status</span><Badge variant={cameraStatusVariant(selected.status)}>{formatLabel(selected.status)}</Badge></div>
              <div className="flex justify-between"><span className="text-slate-500">Resolution</span><span className="text-slate-200">{selected.resolution || '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">FPS</span><span className="text-slate-200">{selected.fps ?? '—'}</span></div>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4">Recent Detections</h3>
            <div className="space-y-3 max-h-72 overflow-y-auto scrollbar-thin pr-1">
              {detections.length === 0 ? (
                <p className="text-sm text-slate-500">No recent detections.</p>
              ) : (
                detections.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm border-b border-border/60 pb-2 last:border-0">
                    <div>
                      <p className="text-slate-200 font-mono text-xs">{formatLabel(d.prediction)}</p>
                      <p className="text-xs text-slate-500">{d.camera?.name || d.cameraId} · {formatDate(d.timestamp)}</p>
                    </div>
                    <Badge variant={confidenceVariant(d.confidence)}>{(d.confidence * 100).toFixed(1)}%</Badge>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}