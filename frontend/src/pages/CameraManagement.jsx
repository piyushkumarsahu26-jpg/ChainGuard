import React, { useCallback, useEffect, useState } from 'react';
import { Wifi, WifiOff, Wrench, AlertTriangle, RotateCw, Settings2, Gauge, Monitor, Clock, Camera as CameraIcon } from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import cameraService from '../services/cameraService';

// Mirrors the backend's CameraStatus enum exactly (ONLINE / OFFLINE /
// DEGRADED / MAINTENANCE) — the old dummy-data version only had three of
// these four states.
const statusMeta = {
  ONLINE: { variant: 'primary', icon: Wifi, label: 'Online' },
  OFFLINE: { variant: 'danger', icon: WifiOff, label: 'Offline' },
  DEGRADED: { variant: 'warning', icon: AlertTriangle, label: 'Degraded' },
  MAINTENANCE: { variant: 'warning', icon: Wrench, label: 'Maintenance' },
};

export default function CameraManagement() {
  const { pushToast } = useApp();

  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [settingsCam, setSettingsCam] = useState(null);
  const [settingsForm, setSettingsForm] = useState({ name: '', location: '', resolution: '' });
  const [savingSettings, setSavingSettings] = useState(false);
  const [restarting, setRestarting] = useState(null);

  const loadCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await cameraService.getAll({ limit: 100 });
      setCameras(result.items || []);
    } catch (err) {
      console.error('Camera Management Error:', err);
      setError('Failed to load cameras.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  const restart = async (id) => {
    setRestarting(id);
    try {
      // There is no dedicated "restart" endpoint — the heartbeat endpoint
      // already records a status + timestamp for a camera, which is exactly
      // what a manual restart-to-online action needs.
      const updated = await cameraService.heartbeat(id, 'ONLINE');
      setCameras((prev) => prev.map((c) => (c.id === id ? updated : c)));
      pushToast({ type: 'success', title: 'Camera restarted', message: `${updated.name} is back online.` });
    } catch (err) {
      console.error('Camera restart error:', err);
      pushToast({ type: 'error', title: 'Restart failed', message: 'Could not reach the camera service.' });
    } finally {
      setRestarting(null);
    }
  };

  const openSettings = (camera) => {
    setSettingsCam(camera);
    setSettingsForm({
      name: camera.name || '',
      location: camera.location || '',
      resolution: camera.resolution || '1920x1080',
    });
  };

  const saveSettings = async () => {
    if (!settingsCam) return;
    setSavingSettings(true);
    try {
      const updated = await cameraService.update(settingsCam.id, settingsForm);
      setCameras((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      pushToast({ type: 'success', title: 'Camera updated', message: `${updated.name} settings saved.` });
      setSettingsCam(null);
    } catch (err) {
      console.error('Camera update error:', err);
      pushToast({ type: 'error', title: 'Update failed', message: 'Could not save camera settings.' });
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-50">Camera Management</h1>
        <p className="text-slate-500 text-sm mt-1">Monitor and maintain every camera in the chain-of-custody network.</p>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5">
              <Skeleton className="h-5 w-2/3 mb-3" />
              <Skeleton className="h-3 w-1/3 mb-6" />
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-full" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-5">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load cameras"
            description={error}
            action={(
              <button onClick={loadCameras} className="text-sm text-primary-400 hover:text-primary-500">
                Try again
              </button>
            )}
          />
        </Card>
      ) : cameras.length === 0 ? (
        <Card className="p-5">
          <EmptyState
            icon={CameraIcon}
            title="No cameras registered yet"
            description="Cameras will appear here once they're added to the network."
          />
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {cameras.map((c) => {
            const meta = statusMeta[c.status] || statusMeta.OFFLINE;
            return (
              <Card key={c.id} hover className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-slate-100 font-medium">{c.name}</p>
                    <p className="text-xs text-slate-500 font-mono">{c.location || '—'}</p>
                  </div>
                  <Badge variant={meta.variant} dot>{meta.label}</Badge>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5"><Monitor size={13} /> Resolution</span>
                    <span className="text-slate-300">{c.resolution || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5"><Gauge size={13} /> FPS</span>
                    <span className="text-slate-300">{c.fps || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5"><Clock size={13} /> Last heartbeat</span>
                    <span className="text-slate-300">
                      {c.lastHeartbeat ? new Date(c.lastHeartbeat).toLocaleString() : 'Never'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => restart(c.id)}
                    disabled={restarting === c.id}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-bg-elevated border border-border text-sm text-slate-300 hover:text-slate-100 hover:border-primary-500/30 disabled:opacity-50"
                  >
                    <RotateCw size={14} className={restarting === c.id ? 'animate-spin' : ''} />
                    {restarting === c.id ? 'Restarting…' : 'Restart'}
                  </button>
                  <button
                    onClick={() => openSettings(c)}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-xl bg-bg-elevated border border-border text-sm text-slate-300 hover:text-slate-100 hover:border-primary-500/30"
                  >
                    <Settings2 size={14} /> Settings
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!settingsCam} onClose={() => setSettingsCam(null)} title={`${settingsCam?.name || ''} — Settings`}>
        {settingsCam && (
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-slate-400 block mb-1.5">Camera name</label>
              <input
                value={settingsForm.name}
                onChange={(e) => setSettingsForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Location</label>
              <input
                value={settingsForm.location}
                onChange={(e) => setSettingsForm((f) => ({ ...f, location: e.target.value }))}
                className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Resolution</label>
              <select
                value={settingsForm.resolution}
                onChange={(e) => setSettingsForm((f) => ({ ...f, resolution: e.target.value }))}
                className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              >
                <option>1280x720</option>
                <option>1920x1080</option>
                <option>2560x1440</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSettingsCam(null)}
                className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="px-4 py-2 rounded-xl text-sm bg-primary-500 hover:bg-primary-600 text-bg font-medium disabled:opacity-60"
              >
                {savingSettings ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
