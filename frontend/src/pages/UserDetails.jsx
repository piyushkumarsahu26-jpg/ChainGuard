import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, User, Mail, Phone, Building2, Briefcase, MapPin, Calendar,
  Shield, Power, Trash2, RotateCcw, KeyRound, AlertTriangle, Loader2,
} from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import userService from '../services/userService';
import auditLogService from '../services/auditLogService';
import { ROLE_OPTIONS, roleLabel } from '../constants/roles';

const auditActionLabel = {
  USER_CREATED: 'Account created',
  USER_UPDATED: 'Profile updated',
  USER_DELETED: 'Account deleted',
  USER_RESTORED: 'Account restored',
  ROLE_CHANGED: 'Role changed',
  PASSWORD_RESET: 'Password reset by administrator',
  PASSWORD_CHANGED: 'Password changed',
  ACCOUNT_ACTIVATED: 'Account activated',
  ACCOUNT_DEACTIVATED: 'Account deactivated',
  LOGIN: 'Logged in',
  LOGOUT: 'Logged out',
  LOGIN_FAILED: 'Failed login attempt',
};

const fieldRow = (Icon, label, value) => (
  <div className="flex items-start gap-3 py-2.5">
    <Icon size={15} className="text-slate-500 mt-0.5 shrink-0" />
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm text-slate-200">{value || '—'}</p>
    </div>
  </div>
);

export default function UserDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser, pushToast } = useApp();
  const isSelf = currentUser?.id === id;

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const [roleOpen, setRoleOpen] = useState(false);
  const [pendingRole, setPendingRole] = useState('');
  const [changingRole, setChangingRole] = useState(false);

  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const [confirmAction, setConfirmAction] = useState(null); // 'activate' | 'deactivate' | 'delete' | 'restore'
  const [actingOnStatus, setActingOnStatus] = useState(false);

  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await userService.getById(id);
      setUser(data);
    } catch (err) {
      console.error('User Details Error:', err);
      setError('Failed to load this user.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const result = await auditLogService.getAll({ targetUserId: id, limit: 8 });
      setActivity(result.items || []);
    } catch (err) {
      // Non-fatal: Auditor/Administrator-only endpoint. If the current
      // user isn't authorized (shouldn't happen on this admin-only page,
      // but defensively) this panel just stays empty rather than erroring
      // the whole page out.
      console.error('Activity load error:', err);
    } finally {
      setActivityLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    loadActivity();
  }, [load, loadActivity]);

  const openEdit = () => {
    setEditForm({
      name: user.name || '',
      employeeId: user.employeeId || '',
      department: user.department || '',
      designation: user.designation || '',
      phone: user.phone || '',
      assignedCenter: user.assignedCenter || '',
    });
    setEditOpen(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await userService.update(id, editForm);
      setUser((u) => ({ ...u, ...updated }));
      pushToast({ type: 'success', title: 'Profile updated', message: `${updated.name}'s details were saved.` });
      setEditOpen(false);
      loadActivity();
    } catch (err) {
      console.error('Update user error:', err);
      pushToast({ type: 'error', title: 'Update failed', message: err?.response?.data?.message || 'Could not save changes.' });
    } finally {
      setSaving(false);
    }
  };

  const submitRoleChange = async () => {
    setChangingRole(true);
    try {
      const updated = await userService.updateRole(id, pendingRole);
      setUser((u) => ({ ...u, ...updated }));
      pushToast({ type: 'success', title: 'Role updated', message: `Role changed to ${roleLabel(pendingRole)}.` });
      setRoleOpen(false);
      loadActivity();
    } catch (err) {
      console.error('Role change error:', err);
      pushToast({ type: 'error', title: 'Role change failed', message: err?.response?.data?.message || 'Could not change role.' });
    } finally {
      setChangingRole(false);
    }
  };

  const submitPasswordReset = async (e) => {
    e.preventDefault();
    setResetting(true);
    try {
      await userService.resetPassword(id, newPassword);
      pushToast({ type: 'success', title: 'Password reset', message: `${user.name}'s password has been reset.` });
      setResetOpen(false);
      setNewPassword('');
      loadActivity();
    } catch (err) {
      console.error('Password reset error:', err);
      pushToast({ type: 'error', title: 'Reset failed', message: err?.response?.data?.message || 'Could not reset password.' });
    } finally {
      setResetting(false);
    }
  };

  const runConfirmedAction = async () => {
    setActingOnStatus(true);
    try {
      let updated;
      let message;
      if (confirmAction === 'activate') {
        updated = await userService.updateStatus(id, true);
        message = 'Account activated.';
      } else if (confirmAction === 'deactivate') {
        updated = await userService.updateStatus(id, false);
        message = 'Account deactivated.';
      } else if (confirmAction === 'delete') {
        updated = await userService.softDelete(id);
        message = 'Account deleted (soft delete).';
      } else if (confirmAction === 'restore') {
        updated = await userService.restore(id);
        message = 'Account restored.';
      }
      setUser((u) => ({ ...u, ...updated }));
      pushToast({ type: 'success', title: 'Done', message });
      setConfirmAction(null);
      loadActivity();
    } catch (err) {
      console.error('Status action error:', err);
      pushToast({ type: 'error', title: 'Action failed', message: err?.response?.data?.message || 'Could not complete this action.' });
    } finally {
      setActingOnStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="p-5"><Skeleton className="h-40 w-full" /></Card>
      </div>
    );
  }

  if (error || !user) {
    return (
      <Card className="p-5">
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load this user"
          description={error}
          action={<button onClick={load} className="text-sm text-primary-400 hover:text-primary-500">Try again</button>}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/users" className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">{user.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{user.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {user.deletedAt ? (
            <Badge variant="danger" dot>Deleted</Badge>
          ) : user.isActive ? (
            <Badge variant="primary" dot>Active</Badge>
          ) : (
            <Badge variant="warning" dot>Inactive</Badge>
          )}
        </div>
      </div>

      {isSelf && (
        <Card className="p-4 bg-accent/5 border-accent/20">
          <p className="text-sm text-accent">This is your own account — role changes, deactivation, and deletion are disabled here to prevent locking yourself out. Use Settings to change your own password.</p>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display font-semibold text-slate-100">Profile</h3>
            <button onClick={openEdit} className="text-xs text-primary-400 hover:text-primary-500">Edit</button>
          </div>
          <div className="divide-y divide-border/60">
            {fieldRow(User, 'Full Name', user.name)}
            {fieldRow(Mail, 'Email', user.email)}
            {fieldRow(Briefcase, 'Employee ID', user.employeeId)}
            {fieldRow(Building2, 'Department', user.department)}
            {fieldRow(Shield, 'Designation', user.designation)}
            {fieldRow(Phone, 'Phone', user.phone)}
            {fieldRow(MapPin, 'Assigned Examination Centre', user.assignedCenter)}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-100 mb-4">Access & Status</h3>
          <div className="space-y-2 text-sm mb-4">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Role</span>
              <span className="text-slate-200">{roleLabel(user.role)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Created by</span>
              <span className="text-slate-200">{user.createdBy?.name || 'Self-registered'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Last login</span>
              <span className="text-slate-200">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Created</span>
              <span className="text-slate-200">{new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-border">
            <button
              disabled={isSelf}
              onClick={() => { setPendingRole(user.role); setRoleOpen(true); }}
              className="w-full inline-flex items-center gap-2 py-2 rounded-xl bg-bg-elevated border border-border text-sm text-slate-300 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Shield size={14} /> Change Role
            </button>
            <button
              onClick={() => setResetOpen(true)}
              className="w-full inline-flex items-center gap-2 py-2 rounded-xl bg-bg-elevated border border-border text-sm text-slate-300 hover:text-slate-100"
            >
              <KeyRound size={14} /> Reset Password
            </button>
            {!user.deletedAt && (
              <button
                disabled={isSelf}
                onClick={() => setConfirmAction(user.isActive ? 'deactivate' : 'activate')}
                className="w-full inline-flex items-center gap-2 py-2 rounded-xl bg-bg-elevated border border-border text-sm text-slate-300 hover:text-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Power size={14} /> {user.isActive ? 'Deactivate' : 'Activate'} Account
              </button>
            )}
            {user.deletedAt ? (
              <button
                onClick={() => setConfirmAction('restore')}
                className="w-full inline-flex items-center gap-2 py-2 rounded-xl bg-primary-500/10 border border-primary-500/30 text-sm text-primary-400 hover:bg-primary-500/20"
              >
                <RotateCcw size={14} /> Restore Account
              </button>
            ) : (
              <button
                disabled={isSelf}
                onClick={() => setConfirmAction('delete')}
                className="w-full inline-flex items-center gap-2 py-2 rounded-xl bg-danger/10 border border-danger/30 text-sm text-danger hover:bg-danger/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} /> Delete Account
              </button>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-display font-semibold text-slate-100 mb-4">Recent Activity</h3>
        {activityLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : activity.length === 0 ? (
          <p className="text-sm text-slate-500">No recorded activity for this account yet.</p>
        ) : (
          <ol className="relative border-l border-border ml-2">
            {activity.map((a) => (
              <li key={a.id} className="mb-4 ml-5 last:mb-0">
                <span
                  className={`absolute -left-[7px] w-3 h-3 rounded-full ring-4 ring-bg-card ${
                    a.action === 'LOGIN_FAILED' || a.action === 'USER_DELETED' ? 'bg-danger' : 'bg-primary-500'
                  }`}
                />
                <p className="text-sm text-slate-200">
                  {auditActionLabel[a.action] || a.action}
                  {a.actor?.name && <span className="text-slate-500"> · by {a.actor.name}</span>}
                </p>
                <p className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}{a.ipAddress ? ` · ${a.ipAddress}` : ''}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* Edit profile modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Profile">
        {editForm && (
          <form onSubmit={saveEdit} className="space-y-4 text-sm">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-slate-400 block mb-1.5">Full Name</label>
                <input required value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1.5">Employee ID</label>
                <input value={editForm.employeeId} onChange={(e) => setEditForm((f) => ({ ...f, employeeId: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1.5">Department</label>
                <input value={editForm.department} onChange={(e) => setEditForm((f) => ({ ...f, department: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1.5">Designation</label>
                <input value={editForm.designation} onChange={(e) => setEditForm((f) => ({ ...f, designation: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1.5">Phone</label>
                <input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
              </div>
              <div>
                <label className="text-slate-400 block mb-1.5">Assigned Centre</label>
                <input value={editForm.assignedCenter} onChange={(e) => setEditForm((f) => ({ ...f, assignedCenter: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-primary-500 hover:bg-primary-600 text-bg font-medium disabled:opacity-60">
                {saving && <Loader2 size={14} className="animate-spin" />} Save
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Change role modal */}
      <Modal open={roleOpen} onClose={() => setRoleOpen(false)} title="Change Role">
        <div className="space-y-4 text-sm">
          <select value={pendingRole} onChange={(e) => setPendingRole(e.target.value)} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40">
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setRoleOpen(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200">Cancel</button>
            <button onClick={submitRoleChange} disabled={changingRole} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-primary-500 hover:bg-primary-600 text-bg font-medium disabled:opacity-60">
              {changingRole && <Loader2 size={14} className="animate-spin" />} Confirm
            </button>
          </div>
        </div>
      </Modal>

      {/* Reset password modal */}
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset Password">
        <form onSubmit={submitPasswordReset} className="space-y-4 text-sm">
          <div>
            <label className="text-slate-400 block mb-1.5">New Password</label>
            <input required type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            <p className="text-xs text-slate-600 mt-1.5">The user will need this new password on their next login — it is not emailed automatically.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setResetOpen(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200">Cancel</button>
            <button type="submit" disabled={resetting} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-primary-500 hover:bg-primary-600 text-bg font-medium disabled:opacity-60">
              {resetting && <Loader2 size={14} className="animate-spin" />} Reset
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm activate/deactivate/delete/restore */}
      <Modal open={!!confirmAction} onClose={() => setConfirmAction(null)} title="Confirm Action">
        <div className="space-y-4 text-sm">
          <p className="text-slate-300">
            {confirmAction === 'delete' && `Delete ${user.name}'s account? They will no longer appear in any list, but their history is preserved and this can be undone with Restore.`}
            {confirmAction === 'restore' && `Restore ${user.name}'s account? They will regain access immediately.`}
            {confirmAction === 'deactivate' && `Deactivate ${user.name}'s account? They will be unable to log in until reactivated.`}
            {confirmAction === 'activate' && `Activate ${user.name}'s account? They will regain the ability to log in.`}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setConfirmAction(null)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200">Cancel</button>
            <button
              onClick={runConfirmedAction}
              disabled={actingOnStatus}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60 ${
                confirmAction === 'delete' || confirmAction === 'deactivate'
                  ? 'bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20'
                  : 'bg-primary-500 hover:bg-primary-600 text-bg'
              }`}
            >
              {actingOnStatus && <Loader2 size={14} className="animate-spin" />} Confirm
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
