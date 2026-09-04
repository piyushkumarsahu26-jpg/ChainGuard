import React, { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Plus, MapPin, Calendar, User as UserIcon, X } from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import examinationService from '../services/examinationService';
import userService from '../services/userService';

const EMPTY_FORM = {
  state: '', city: '', district: '', centre: '', examName: '', subject: '',
  examDate: '', examTime: '10:00 AM', session: '', envelopeCount: 25, officerId: '',
};

// Phase 1 (Architectural Integration sprint): "This DOES NOT create QR
// codes. This DOES NOT start transport. This DOES NOT start GPS. It
// only creates examination metadata." -- this page reflects that
// boundary exactly; QR Generation is a deliberately separate page.
export default function ExaminationSetup() {
  const { pushToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [examinations, setExaminations] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [examResult, officerResult] = await Promise.all([
        examinationService.getAll({ limit: 50 }),
        userService.getAll({ limit: 100 }),
      ]);
      setExaminations(examResult.items || []);
      // No dedicated "Security Officer" role was introduced (the user's
      // own explicit decision) -- any existing officer-capable role can
      // be assigned, matching how examination.service.js's own backend
      // validation already accepts any real user.
      setOfficers((officerResult.items || []).filter((o) => o.role !== 'VIEWER' && o.role !== 'AUDITOR'));
    } catch (err) {
      console.error('Examination Setup load error:', err);
      pushToast({ type: 'error', title: 'Could not load examinations', message: 'Refresh the page to try again.' });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => { load(); }, [load]);

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.state || !form.city || !form.centre || !form.examName || !form.examDate || !form.officerId) {
      pushToast({ type: 'error', title: 'Missing fields', message: 'State, City, Centre, Exam Name, Date, and Officer are required.' });
      return;
    }
    setSubmitting(true);
    try {
      const created = await examinationService.create({
        ...form,
        district: form.district || undefined,
        session: form.session || undefined,
        envelopeCount: Number(form.envelopeCount) || 0,
        examDate: new Date(form.examDate).toISOString(),
      });
      setExaminations((prev) => [created, ...prev]);
      setForm(EMPTY_FORM);
      setShowForm(false);
      pushToast({ type: 'success', title: 'Examination created', message: `${created.examName} — ${created.centre}` });
    } catch (err) {
      console.error('Create examination error:', err);
      pushToast({ type: 'error', title: 'Could not create examination', message: err?.response?.data?.message || err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50 flex items-center gap-2">
            <GraduationCap size={22} className="text-primary-500" /> Examination Setup
          </h1>
          <p className="text-slate-500 text-sm mt-1">Create examination metadata before envelopes exist.</p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-bg font-medium rounded-xl px-4 py-2.5 text-sm"
        >
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Cancel' : 'New Examination'}
        </button>
      </div>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="State" value={form.state} onChange={(v) => updateField('state', v)} required />
            <Field label="City" value={form.city} onChange={(v) => updateField('city', v)} required />
            <Field label="District (optional)" value={form.district} onChange={(v) => updateField('district', v)} />
            <Field label="Examination Centre" value={form.centre} onChange={(v) => updateField('centre', v)} required />
            <Field label="Exam Name" value={form.examName} onChange={(v) => updateField('examName', v)} required />
            <Field label="Subject (optional)" value={form.subject} onChange={(v) => updateField('subject', v)} />
            <Field label="Exam Date" type="date" value={form.examDate} onChange={(v) => updateField('examDate', v)} required />
            <Field label="Exam Time" value={form.examTime} onChange={(v) => updateField('examTime', v)} />
            <Field label="Session (optional)" value={form.session} onChange={(v) => updateField('session', v)} placeholder="e.g. Morning" />
            <Field label="Number of Envelopes" type="number" value={form.envelopeCount} onChange={(v) => updateField('envelopeCount', v)} min={0} />
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Security Officer</label>
              <select
                value={form.officerId}
                onChange={(e) => updateField('officerId', e.target.value)}
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-slate-200"
              >
                <option value="">Select officer…</option>
                {officers.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-bg font-medium rounded-xl px-5 py-2.5 text-sm"
              >
                {submitting ? 'Creating…' : 'Create Examination'}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="font-display font-semibold text-slate-100 mb-4">Examinations</h3>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : examinations.length === 0 ? (
          <EmptyState icon={GraduationCap} title="No examinations yet" description="Create one above to begin." />
        ) : (
          <div className="space-y-2">
            {examinations.map((exam) => (
              <div key={exam.id} className="bg-bg-elevated rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm text-slate-200 font-medium">{exam.examName} — {exam.subject}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                    <span className="flex items-center gap-1"><MapPin size={11} /> {exam.centre}, {exam.city}, {exam.state}</span>
                    <span className="flex items-center gap-1"><Calendar size={11} /> {new Date(exam.examDate).toLocaleDateString()} · {exam.examTime}</span>
                    <span className="flex items-center gap-1"><UserIcon size={11} /> {exam.officer?.name || '—'}</span>
                  </p>
                </div>
                <Badge variant="neutral">{exam.envelopeCount} envelope(s) planned</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder, min }) {
  return (
    <div>
      <label className="text-xs text-slate-500 mb-1 block">{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        min={min}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
      />
    </div>
  );
}
