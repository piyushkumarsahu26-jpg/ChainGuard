import React, { useState } from 'react';
import {
  Settings as SettingsIcon, Bell, ShieldCheck, BrainCircuit, Database, KeyRound, Palette, UserCircle, Copy, Check, Loader2, Monitor,
} from 'lucide-react';
import Card from '../components/ui/Card';
import { useApp } from '../context/AppContext';
import authService from '../services/authService';
import { roleLabel } from '../constants/roles';

const tabs = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'model', label: 'AI Model', icon: BrainCircuit },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'api', label: 'API Keys', icon: KeyRound },
  { id: 'theme', label: 'Theme', icon: Palette },
  { id: 'profile', label: 'Profile', icon: UserCircle },
];

function Toggle({ label, description, defaultChecked = true }) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/60 last:border-0">
      <div>
        <p className="text-sm text-slate-200">{label}</p>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => setOn((v) => !v)}
        className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${on ? 'bg-primary-500' : 'bg-bg-elevated border border-border'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const { user, pushToast } = useApp();
  const [tab, setTab] = useState('general');
  const [copied, setCopied] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingPw, setChangingPw] = useState(false);

  const submitPasswordChange = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      pushToast({ type: 'error', title: 'Passwords do not match', message: 'New password and confirmation must match.' });
      return;
    }
    setChangingPw(true);
    try {
      await authService.changePassword(pwForm.currentPassword, pwForm.newPassword);
      pushToast({ type: 'success', title: 'Password changed', message: 'Your password has been updated.' });
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      console.error('Change password error:', err);
      pushToast({ type: 'error', title: 'Change failed', message: err?.response?.data?.message || 'Could not change your password.' });
    } finally {
      setChangingPw(false);
    }
  };

  const copyKey = () => {
    setCopied(true);
    pushToast({ type: 'success', title: 'API key copied' });
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-50">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Configure ChainGuard to match your organization's needs.</p>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <Card className="p-2 h-fit lg:sticky lg:top-6">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm whitespace-nowrap transition-colors ${
                  tab === t.id ? 'bg-primary-500/10 text-primary-400' : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </nav>
        </Card>

        <Card className="p-6">
          {tab === 'general' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-slate-100 mb-2">General</h3>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Organization name</label>
                <input defaultValue="Directorate of Public Examinations" className="w-full max-w-md bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Time zone</label>
                <select className="w-full max-w-md bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40">
                  <option>Asia/Kolkata (GMT+5:30)</option>
                  <option>UTC</option>
                </select>
              </div>
              <Toggle label="Auto-refresh dashboard" description="Refresh live stats every 30 seconds" />
              <Toggle label="Compact sidebar by default" description="Start with the sidebar collapsed" defaultChecked={false} />
            </div>
          )}

          {tab === 'notifications' && (
            <div>
              <h3 className="font-display font-semibold text-slate-100 mb-2">Notifications</h3>
              <Toggle label="Critical alert emails" description="Instant email when a critical alert fires" />
              <Toggle label="Daily summary digest" description="Sent every morning at 8:00 AM" />
              <Toggle label="Camera offline notice" description="Notify when any camera disconnects" />
              <Toggle label="SMS escalation" description="Text message for unresolved alerts after 15 min" defaultChecked={false} />
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-6">
              <div>
                <h3 className="font-display font-semibold text-slate-100 mb-2">Change Password</h3>
                <form onSubmit={submitPasswordChange} className="space-y-3 max-w-md">
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Current password</label>
                    <input required type="password" value={pwForm.currentPassword} onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">New password</label>
                    <input required type="password" minLength={8} value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 block mb-1.5">Confirm new password</label>
                    <input required type="password" minLength={8} value={pwForm.confirmPassword} onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
                  </div>
                  <button type="submit" disabled={changingPw} className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-bg font-medium rounded-xl px-4 py-2.5 text-sm disabled:opacity-60">
                    {changingPw && <Loader2 size={14} className="animate-spin" />} {changingPw ? 'Changing…' : 'Change Password'}
                  </button>
                </form>
              </div>

              <div className="pt-4 border-t border-border">
                <h3 className="font-display font-semibold text-slate-100 mb-3 flex items-center gap-2"><Monitor size={16} /> Session Information</h3>
                <div className="grid sm:grid-cols-2 gap-4 text-sm max-w-md">
                  <div>
                    <p className="text-slate-500 text-xs">Signed in as</p>
                    <p className="text-slate-200 mt-0.5">{user?.name}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Role</p>
                    <p className="text-slate-200 mt-0.5">{roleLabel(user?.role)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 text-xs">Email</p>
                    <p className="text-slate-200 mt-0.5">{user?.email}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'model' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-slate-100 mb-2">AI Model</h3>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Active model version</label>
                <select className="w-full max-w-md bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40">
                  <option>v4.2.1 (current)</option>
                  <option>v4.2.0</option>
                  <option>v4.1.4</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Confidence threshold</label>
                <input type="range" min="50" max="100" defaultValue="85" className="w-full max-w-md accent-primary-500" />
              </div>
              <Toggle label="Auto-update model" description="Apply new model versions automatically" />
            </div>
          )}

          {tab === 'database' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-slate-100 mb-2">Database</h3>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="bg-bg-elevated rounded-xl p-4 border border-border">
                  <p className="text-slate-500 text-xs">Storage used</p>
                  <p className="text-slate-100 font-mono text-lg mt-1">482 GB / 1 TB</p>
                </div>
                <div className="bg-bg-elevated rounded-xl p-4 border border-border">
                  <p className="text-slate-500 text-xs">Retention period</p>
                  <p className="text-slate-100 font-mono text-lg mt-1">180 days</p>
                </div>
              </div>
              <Toggle label="Automatic backups" description="Nightly encrypted backup at 2:00 AM" />
            </div>
          )}

          {tab === 'api' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-slate-100 mb-2">API Keys</h3>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Production key</label>
                <div className="flex items-center gap-2 max-w-md">
                  <input readOnly value="cg_live_••••••••••••7f3a" className="flex-1 bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-300 font-mono" />
                  <button onClick={copyKey} className="w-9 h-9 rounded-xl bg-bg-elevated border border-border flex items-center justify-center text-slate-400 hover:text-slate-100">
                    {copied ? <Check size={14} className="text-primary-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
              <button className="text-sm text-primary-400 hover:text-primary-500">+ Generate new key</button>
            </div>
          )}

          {tab === 'theme' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-slate-100 mb-2">Theme</h3>
              <p className="text-sm text-slate-500">ChainGuard uses a fixed dark, high-contrast theme optimized for control rooms.</p>
              <div className="flex gap-3">
                {['#22C55E', '#38BDF8', '#0F172A', '#020617'].map((c) => (
                  <div key={c} className="w-10 h-10 rounded-xl border border-border" style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          )}

          {tab === 'profile' && (
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-slate-100 mb-2">Profile</h3>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent flex items-center justify-center text-lg font-semibold text-bg">
                  {(user?.name || 'U').trim().split(/\s+/).map((n) => n[0]).join('').toUpperCase()}
                </div>
                <div>
                  <p className="text-slate-100 font-medium">{user?.name}</p>
                  <p className="text-xs text-slate-500">{roleLabel(user?.role)}</p>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1.5">Email</label>
                <input readOnly value={user?.email || ''} className="w-full max-w-md bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-400 cursor-not-allowed" />
                <p className="text-xs text-slate-600 mt-1.5">Email and extended profile fields (employee ID, department, etc.) are managed by an Administrator via the Administration section.</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
