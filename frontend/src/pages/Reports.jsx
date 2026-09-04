import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Download, Calendar, MapPin, PackageSearch, UserCircle, Loader2, AlertTriangle, LayoutDashboard, ShieldAlert, Truck, Cpu, Users, Eye } from 'lucide-react';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Modal from '../components/ui/Modal';
import { useApp } from '../context/AppContext';
import reportService from '../services/reportService';
import envelopeService from '../services/envelopeService';
import userService from '../services/userService';
import { SOCKET_BASE_URL } from '../services/api';

// Sprint 8, Part 11 — the 5 requested report types. Distinct from this
// page's pre-existing PDF_EXPORT/CSV_EXPORT flow below (which stays
// completely unchanged) — these generate real, structured content
// (report.service.js's new BUILDERS) rather than a downloadable file.
const INTELLIGENCE_REPORT_TYPES = [
  { type: 'EXECUTIVE', label: 'Executive Report', icon: LayoutDashboard },
  { type: 'SECURITY', label: 'Security Report', icon: ShieldAlert },
  { type: 'TRANSPORT_SUMMARY', label: 'Transport Summary', icon: Truck },
  { type: 'AI_SUMMARY', label: 'AI Summary', icon: Cpu },
  { type: 'OFFICER_SUMMARY', label: 'Officer Summary', icon: Users },
];

export default function Reports() {
  const { pushToast } = useApp();

  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState({ from: '', to: '', center: 'All Centers', envelope: 'All Envelopes', officer: 'All Officers' });
  const [generatingType, setGeneratingType] = useState(null);
  const [viewingReport, setViewingReport] = useState(null);

  const [centers, setCenters] = useState([]);
  const [envelopes, setEnvelopes] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);

  const [reports, setReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFilterOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const [centerList, envelopeResult, officerList] = await Promise.all([
        envelopeService.getCenters(),
        envelopeService.getAll({ limit: 100 }),
        userService.getOfficers(),
      ]);
      setCenters(centerList);
      setEnvelopes(envelopeResult.items || []);
      setOfficers(officerList);
    } catch (err) {
      console.error('Reports filter options error:', err);
      // Non-fatal: the report builder still works with "All ..." defaults,
      // it just won't offer specific centers/envelopes/officers to narrow by.
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    setError(null);
    try {
      const result = await reportService.getAll({ limit: 20 });
      setReports(result.items || []);
    } catch (err) {
      console.error('Reports list error:', err);
      setError('Failed to load saved reports.');
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFilterOptions();
    loadReports();
  }, [loadFilterOptions, loadReports]);

  const generate = async (format) => {
    setGenerating(true);
    try {
      const title = `${format} Report — ${filters.center} — ${new Date().toLocaleDateString()}`;
      const created = await reportService.generate({
        title,
        type: format === 'PDF' ? 'PDF_EXPORT' : 'CSV_EXPORT',
        filters,
      });
      setReports((prev) => [created, ...prev]);
      pushToast({
        type: 'success',
        title: 'Report generated',
        message: `"${created.title}" has been saved.`,
      });
    } catch (err) {
      console.error('Report generation error:', err);
      const message = err?.response?.data?.message || `Failed to generate ${format} report.`;
      pushToast({ type: 'error', title: 'Generation failed', message });
    } finally {
      setGenerating(false);
    }
  };

  const downloadUrl = (report) => (report.filePath ? `${SOCKET_BASE_URL}/${report.filePath}` : null);

  const generateIntelligenceReport = async ({ type, label }) => {
    setGeneratingType(type);
    try {
      const created = await reportService.generate({
        title: `${label} — ${new Date().toLocaleDateString()}`,
        type,
      });
      setReports((prev) => [created, ...prev]);
      setViewingReport(created);
      pushToast({ type: 'success', title: 'Report generated', message: `"${created.title}" is ready.` });
    } catch (err) {
      console.error('Intelligence report generation error:', err);
      pushToast({ type: 'error', title: 'Generation failed', message: err?.response?.data?.message || err.message });
    } finally {
      setGeneratingType(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-50">Reports</h1>
        <p className="text-slate-500 text-sm mt-1">Generate and export compliance reports for audits and reviews.</p>
      </div>

      <Card className="p-5">
        <h3 className="font-display font-semibold text-slate-100 mb-1">Intelligence Reports</h3>
        <p className="text-xs text-slate-500 mb-4">Real, computed figures from across the platform — generated instantly, viewable right here.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {INTELLIGENCE_REPORT_TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => generateIntelligenceReport({ type, label })}
              disabled={generatingType !== null}
              className="flex flex-col items-center gap-2 bg-bg-elevated border border-border hover:border-primary-500/30 rounded-xl px-3 py-4 text-sm text-slate-300 hover:text-slate-100 disabled:opacity-50"
            >
              {generatingType === type ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold text-slate-100 mb-4">Build a custom report</h3>
        {optionsLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-xs text-slate-500 flex items-center gap-1.5 mb-1.5"><Calendar size={13} /> From</label>
              <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div>
              <label className="text-xs text-slate-500 flex items-center gap-1.5 mb-1.5"><Calendar size={13} /> To</label>
              <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
            <div>
              <label className="text-xs text-slate-500 flex items-center gap-1.5 mb-1.5"><MapPin size={13} /> Center</label>
              <select value={filters.center} onChange={(e) => setFilters((f) => ({ ...f, center: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40">
                <option>All Centers</option>
                {centers.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 flex items-center gap-1.5 mb-1.5"><PackageSearch size={13} /> Envelope</label>
              <select value={filters.envelope} onChange={(e) => setFilters((f) => ({ ...f, envelope: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40">
                <option>All Envelopes</option>
                {envelopes.map((e) => <option key={e.id} value={e.envelopeCode}>{e.envelopeCode}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 flex items-center gap-1.5 mb-1.5"><UserCircle size={13} /> Officer</label>
              <select value={filters.officer} onChange={(e) => setFilters((f) => ({ ...f, officer: e.target.value }))} className="w-full bg-bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40">
                <option>All Officers</option>
                {officers.map((o) => <option key={o.id} value={o.name}>{o.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button
            onClick={() => generate('PDF')}
            disabled={generating}
            className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-bg font-medium rounded-xl px-4 py-2.5 text-sm disabled:opacity-60"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            Generate PDF
          </button>
          <button
            onClick={() => generate('CSV')}
            disabled={generating}
            className="inline-flex items-center gap-2 bg-bg-elevated border border-border rounded-xl px-4 py-2.5 text-sm text-slate-300 hover:text-slate-100 disabled:opacity-60"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
            Generate CSV
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-3">
          Reports are saved with your selected filters. File rendering (actual downloadable PDF/CSV output) is part of a later phase — for now, generating a report records it below.
        </p>
      </Card>

      <Card className="p-5">
        <h3 className="font-display font-semibold text-slate-100 mb-4">Saved Reports</h3>
        {reportsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load saved reports"
            description={error}
            action={<button onClick={loadReports} className="text-sm text-primary-400 hover:text-primary-500">Try again</button>}
          />
        ) : reports.length === 0 ? (
          <EmptyState icon={FileText} title="No reports generated yet" description="Build a report above to see it listed here." />
        ) : (
          <div className="space-y-3">
            {reports.map((r) => {
              const url = downloadUrl(r);
              return (
                <div key={r.id} className="flex items-center justify-between border-b border-border/60 pb-3 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
                      <FileText size={16} />
                    </div>
                    <div>
                      <p className="text-sm text-slate-200">{r.title}</p>
                      <p className="text-xs text-slate-500">Generated {new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.content && (
                      <button
                        onClick={() => setViewingReport(r)}
                        className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-500"
                      >
                        <Eye size={13} /> View
                      </button>
                    )}
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-500"
                      >
                        <Download size={13} /> Download
                      </a>
                    ) : !r.content ? (
                      <span className="text-xs text-slate-600" title="File rendering isn't connected yet">
                        Not yet available
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal
        open={!!viewingReport}
        onClose={() => setViewingReport(null)}
        title={viewingReport?.title || 'Report'}
        size="lg"
      >
        {viewingReport?.content ? (
          <pre className="text-xs text-slate-300 bg-bg-elevated rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(viewingReport.content, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-slate-500">This report has no computed content.</p>
        )}
      </Modal>
    </div>
  );
}
