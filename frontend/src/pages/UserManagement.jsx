import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, AlertTriangle, Users as UsersIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import userService from '../services/userService';
import { ROLE_OPTIONS, roleLabel } from '../constants/roles';

const emptyForm = { name: '', email: '', password: '', role: 'VIEWER', employeeId: '', department: '', designation: '', phone: '', assignedCenter: '' };

export default function UserManagement() {
  const { pushToast } = useApp();
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit: 10 };
      if (q) params.q = q;
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.isActive = statusFilter === 'active';
      const result = await userService.search(params);
      setItems(result.items || []);
      setMeta(result.meta || { page: 1, totalPages: 1 });
    } catch (err) {
      console.error('User Management Error:', err);
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [page, q, roleFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const createUser = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await userService.create(form);
      pushToast({ type: 'success', title: 'User created', message: `${form.name} has been added.` });
      setCreateOpen(false);
      setForm(emptyForm);
      setPage(1);
      load();
    } catch (err) {
      console.error('Create user error:', err);
      const message = err?.response?.data?.message || 'Failed to create user.';
      pushToast({ type: 'error', title: 'Create failed', message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">Administration — Users</h1>
          <p className="text-slate-500 text-sm mt-1">Create, search, and manage every account with access to ChainGuard.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-bg font-medium rounded-xl px-4 py-2.5 text-sm"
        >
          <UserPlus size={16} /> Create User
        </button>
      </div>

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={q}
              onChange={(e) => { setPage(1); setQ(e.target.value); }}
              placeholder="Search name, email, or employee ID..."
              className="w-full bg-bg-elevated border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => { setPage(1); setRoleFilter(e.target.value); }}
            className="bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          >
            <option value="">All Roles</option>
            {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setPage(1); setStatusFilter(e.target.value); }}
            className="bg-bg-elevated border border-border rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <div className="p-5">
            <EmptyState
              icon={AlertTriangle}
              title="Couldn't load users"
              description={error}
              action={<button onClick={load} className="text-sm text-primary-400 hover:text-primary-500">Try again</button>}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={UsersIcon} title="No users match these filters" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-border">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <tr
                      key={u.id}
                      onClick={() => navigate(`/admin/users/${u.id}`)}
                      className="border-b border-border/60 last:border-0 hover:bg-white/5 cursor-pointer"
                    >
                      <td className="px-5 py-3 text-slate-200">{u.name}</td>
                      <td className="px-5 py-3 text-slate-400">{u.email}</td>
                      <td className="px-5 py-3 text-slate-300">{roleLabel(u.role)}</td>
                      <td className="px-5 py-3">
                        {u.deletedAt ? (
                          <Badge variant="danger" dot>Deleted</Badge>
                        ) : u.isActive ? (
                          <Badge variant="primary" dot>Active</Badge>
                        ) : (
                          <Badge variant="warning" dot>Inactive</Badge>
                        )}
                      </td>
                      <td className="px-5 py-3 text-slate-500">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-border text-sm text-slate-500">
              <span>Page {meta.page} of {meta.totalPages || 1}</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-elevated border border-border disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  disabled={page >= (meta.totalPages || 1)}
                  onClick={() => setPage((p) => p + 1)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-bg-elevated border border-border disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create User">
        <form onSubmit={createUser} className="space-y-4 text-sm">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 block mb-1.5">Full Name</label>
              <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Email</label>
              <input required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Temporary Password</label>
              <input required type="password" minLength={8} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Role</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40">
                {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Employee ID</label>
              <input value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Department</label>
              <input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Designation</label>
              <input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div>
              <label className="text-slate-400 block mb-1.5">Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-slate-400 block mb-1.5">Assigned Examination Centre</label>
              <input value={form.assignedCenter} onChange={(e) => setForm((f) => ({ ...f, assignedCenter: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setCreateOpen(false)} className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200">Cancel</button>
            <button type="submit" disabled={creating} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-primary-500 hover:bg-primary-600 text-bg font-medium disabled:opacity-60">
              {creating && <Loader2 size={14} className="animate-spin" />} {creating ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
