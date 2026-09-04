import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Download, CheckCircle2, FolderOpen, AlertTriangle, Info, ArrowUpDown } from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import alertService from '../services/alertService';
import { getSocket } from '../services/socket';

const severityVariant = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'accent',
  LOW: 'primary',
};

const severityIcon = {
  CRITICAL: AlertTriangle,
  HIGH: AlertTriangle,
  MEDIUM: Info,
  LOW: Info,
};

const severityLabels = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

const statusVariant = {
  OPEN: 'danger',
  ACKNOWLEDGED: 'warning',
  RESOLVED: 'primary',
  DISMISSED: 'accent',
};

const formatEnumLabel = (value) =>
  value ? value.charAt(0) + value.slice(1).toLowerCase() : '—';

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');

export default function AlertCenter() {
  const { pushToast } = useApp();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState('All');
  const [sortDesc, setSortDesc] = useState(true);
  const [active, setActive] = useState(null);

  const loadAlerts = useCallback(async () => {
    try {
      const result = await alertService.getAll();
      setAlerts(result.items);
    } catch (error) {
      console.error('Alert Center Error:', error);

      pushToast({
        type: 'error',
        title: 'Alert Center Error',
        message: 'Failed to load alerts.',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // Integration Sprint 4: "refresh... Alert Center... in real time" -- this
  // is the page literally dedicated to alerts, and it had zero socket
  // listeners before this sprint (checked directly). Every alert this
  // project creates -- AI tamper, transport anomaly, camera health --
  // already goes through the one real alert:new event (alertRepository.
  // create() + getIo().emit(), unchanged since Sprint AI-4B); this page
  // just needed to actually listen for it. No debounce here (unlike
  // Dashboard/Analytics' aggregate summaries) -- a fresh, real alert
  // appearing immediately is the entire point of this specific page.
  useEffect(() => {
    const socket = getSocket();
    const onNewAlert = () => loadAlerts();
    socket.on('alert:new', onNewAlert);
    return () => socket.off('alert:new', onNewAlert);
  }, [loadAlerts]);

  const filtered = useMemo(() => {
    let list = alerts.filter((a) =>
      (severityFilter === 'All' || a.severity === severityFilter) &&
      (a.title.toLowerCase().includes(query.toLowerCase()) ||
        (a.envelope?.envelopeCode || '').toLowerCase().includes(query.toLowerCase()))
    );
    list = [...list].sort((a, b) => (sortDesc ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id)));
    return list;
  }, [alerts, query, severityFilter, sortDesc]);

  const resolveAlert = async (id) => {
    try {
      await alertService.resolve(id);
      await loadAlerts();
      setActive(null);
      pushToast({ type: 'success', title: 'Alert resolved', message: `${id} has been marked resolved.` });
    } catch (error) {
      console.error('Resolve Alert Error:', error);

      pushToast({
        type: 'error',
        title: 'Resolve Alert Error',
        message: 'Failed to resolve alert.',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-400 text-sm">Loading alerts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">Alert Center</h1>
          <p className="text-slate-500 text-sm mt-1">Triage, investigate, and resolve integrity alerts.</p>
        </div>
        <button className="inline-flex items-center gap-2 bg-bg-card border border-border rounded-xl px-4 py-2 text-sm text-slate-300 hover:text-slate-100 hover:border-primary-500/30">
          <Download size={15} /> Download report
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
          <Card key={s} className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              s === 'CRITICAL' ? 'bg-danger/10 text-danger' : s === 'HIGH' ? 'bg-warning/10 text-warning' : 'bg-accent/10 text-accent'
            }`}>
              {React.createElement(severityIcon[s], { size: 18 })}
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-100">{alerts.filter((a) => a.severity === s).length}</p>
              <p className="text-xs text-slate-500">{severityLabels[s]} alerts</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title or envelope ID..."
              className="w-full bg-bg-elevated border border-border rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          >
            <option value="All">All</option>
            {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => (
              <option key={s} value={s}>{severityLabels[s]}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDesc((s) => !s)}
            className="inline-flex items-center gap-2 bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-300"
          >
            <ArrowUpDown size={14} /> {sortDesc ? 'Newest' : 'Oldest'}
          </button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No alerts match your filters" description="Try adjusting your search or severity filter." />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-border">
                  <th className="py-2 pr-4 font-medium">Alert</th>
                  <th className="py-2 pr-4 font-medium">Severity</th>
                  <th className="py-2 pr-4 font-medium">Envelope</th>
                  <th className="py-2 pr-4 font-medium">Location</th>
                  <th className="py-2 pr-4 font-medium">Time</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-border/60 hover:bg-white/[0.02]">
                    <td className="py-3 pr-4 text-slate-200">{a.title}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={severityVariant[a.severity] || 'accent'}>{formatEnumLabel(a.severity)}</Badge>
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-400">{a.envelope?.envelopeCode || '—'}</td>
                    <td className="py-3 pr-4 text-slate-400">{a.camera?.name || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500">{formatDate(a.createdAt)}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={statusVariant[a.status] || 'accent'}>{formatEnumLabel(a.status)}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <button onClick={() => setActive(a)} className="text-primary-400 hover:text-primary-500 text-xs font-medium">
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        title={active?.id}
        footer={
          active && active.status !== 'RESOLVED' ? (
            <>
              <button onClick={() => setActive(null)} className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-white/5">
                Close
              </button>
              <button
                onClick={() => resolveAlert(active.id)}
                className="px-4 py-2 rounded-xl text-sm bg-primary-500 text-bg font-medium flex items-center gap-2 hover:bg-primary-600"
              >
                <CheckCircle2 size={15} /> Resolve Alert
              </button>
            </>
          ) : (
            <button onClick={() => setActive(null)} className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-white/5">
              Close
            </button>
          )
        }
      >
        {active && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={severityVariant[active.severity] || 'accent'}>{formatEnumLabel(active.severity)}</Badge>
              <Badge variant={statusVariant[active.status] || 'accent'}>{formatEnumLabel(active.status)}</Badge>
            </div>
            <p className="text-slate-200 font-medium">{active.title}</p>
            <p className="text-sm text-slate-400">{active.description || 'No description available.'}</p>
            <div className="grid grid-cols-2 gap-4 text-sm pt-2 border-t border-border">
              <div><p className="text-slate-500 text-xs">Envelope</p><p className="text-slate-200 font-mono">{active.envelope?.envelopeCode || '—'}</p></div>
              <div><p className="text-slate-500 text-xs">Location</p><p className="text-slate-200">{active.camera?.name || '—'}</p></div>
              <div><p className="text-slate-500 text-xs">Reported</p><p className="text-slate-200">{formatDate(active.createdAt)}</p></div>
              <div><p className="text-slate-500 text-xs">Alert ID</p><p className="text-slate-200 font-mono">{active.id}</p></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}