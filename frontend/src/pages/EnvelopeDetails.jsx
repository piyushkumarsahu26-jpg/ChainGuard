import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QrCode, ChevronDown, User, Truck, ShieldAlert, Image as ImageIcon, AlertTriangle, PackageSearch, Download, GraduationCap, Cpu } from 'lucide-react';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import envelopeService from '../services/envelopeService';
import custodyService from '../services/custodyService';
import gpsService from '../services/gpsService';
import { SOCKET_BASE_URL } from '../services/api';

const eventTypeLabel = {
  CREATED: 'Created & Sealed',
  QR_GENERATED: 'QR Generated',
  QR_SCAN: 'QR Scanned',
  HANDOVER: 'Handover',
  HANDOVER_ACCEPTED: 'Handover Accepted',
  TRANSPORT_START: 'Transport Started',
  TRANSPORT_END: 'Transport Ended',
  RECEIVED_AT_CENTER: 'Received at Center',
  OPENED: 'Opened',
  SEAL_BROKEN: 'Seal Broken',
  DISCREPANCY: 'Discrepancy Flagged',
  VERIFIED: 'QR Verified',
  DAMAGED: 'Damaged',
  TAMPERED: 'Tampered',
  ARCHIVED: 'Archived',
  QR_PRINTED: 'QR Printed',
  QR_ATTACHED: 'QR Attached',
  PACKED: 'Packed',
  SEALED: 'Sealed',
  CHECKPOINT: 'Checkpoint',
  AI_VERIFIED: 'AI Verified',
  COMPLETED: 'Accepted',
};

const PREP_STATUS_LABELS = {
  QR_GENERATED: 'QR Generated', QR_PRINTED: 'QR Printed', QR_ATTACHED: 'QR Attached',
  PACKED: 'Packed', SEALED: 'Sealed', READY_FOR_DISPATCH: 'Ready for Dispatch',
};
const PREP_STATUS_VARIANT = {
  QR_GENERATED: 'neutral', QR_PRINTED: 'neutral', QR_ATTACHED: 'warning',
  PACKED: 'warning', SEALED: 'warning', READY_FOR_DISPATCH: 'primary',
};

const concerningEvents = new Set(['OPENED', 'SEAL_BROKEN', 'DISCREPANCY']);

export default function EnvelopeDetails() {
  // Sprint 8: lets the Security Command Center's AI Scan Feed (and
  // anywhere else) deep-link to a specific envelope via
  // /envelopes?id=<uuid> — falls back to the existing "select the first
  // envelope in the list" behavior when no id is present, so every
  // existing way of reaching this page (sidebar nav with no query
  // string) works exactly as before.
  const [searchParams] = useSearchParams();
  const [envelopes, setEnvelopes] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedId, setSelectedId] = useState('');
  const [envelope, setEnvelope] = useState(null);
  const [custody, setCustody] = useState([]);
  const [transportHistory, setTransportHistory] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const loadEnvelopeList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await envelopeService.getAll({ limit: 100 });
      const items = result.items || [];
      setEnvelopes(items);
      const requestedId = searchParams.get('id');
      if (requestedId && items.some((e) => e.id === requestedId)) {
        setSelectedId(requestedId);
      } else if (items.length > 0) {
        setSelectedId(items[0].id);
      }
    } catch (err) {
      console.error('Envelope list error:', err);
      setListError('Failed to load envelopes.');
    } finally {
      setListLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    loadEnvelopeList();
  }, [loadEnvelopeList]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [envelopeData, custodyData, transportData] = await Promise.all([
          envelopeService.getById(selectedId),
          custodyService.getTrackingHistory(selectedId),
          gpsService.getHistoryByEnvelope(selectedId).catch(() => []), // best-effort -- an envelope not yet dispatched simply has no sessions
        ]);
        if (cancelled) return;
        setEnvelope(envelopeData);
        setCustody(custodyData || []);
        setTransportHistory(transportData || []);
      } catch (err) {
        if (cancelled) return;
        console.error('Envelope detail error:', err);
        setDetailError('Failed to load envelope details.');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };

    loadDetail();
    return () => { cancelled = true; };
  }, [selectedId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-50">Envelope Details</h1>
          <p className="text-slate-500 text-sm mt-1">Full chain-of-custody trace for a single envelope.</p>
        </div>
        {!listLoading && envelopes.length > 0 && (
          <div className="relative">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="appearance-none bg-bg-card border border-border rounded-xl pl-4 pr-9 py-2.5 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            >
              {envelopes.map((e) => (
                <option key={e.id} value={e.id}>{e.envelopeCode}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          </div>
        )}
      </div>

      {listLoading ? (
        <Card className="p-5"><Skeleton className="h-40 w-full" /></Card>
      ) : listError ? (
        <Card className="p-5">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load envelopes"
            description={listError}
            action={<button onClick={loadEnvelopeList} className="text-sm text-primary-400 hover:text-primary-500">Try again</button>}
          />
        </Card>
      ) : envelopes.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={PackageSearch} title="No envelopes yet" description="Envelopes will appear here once they're created at the printing stage." />
        </Card>
      ) : detailLoading || !envelope ? (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-5"><Skeleton className="h-64 w-full" /></Card>
          <Card className="p-5"><Skeleton className="h-64 w-full" /></Card>
        </div>
      ) : detailError ? (
        <Card className="p-5">
          <EmptyState icon={AlertTriangle} title="Couldn't load envelope details" description={detailError} />
        </Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 p-0 overflow-hidden">
              <div className="relative aspect-[16/9] bg-bg-elevated flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <pattern id="gridenv" width="24" height="24" patternUnits="userSpaceOnUse">
                      <path d="M24 0H0V24" fill="none" stroke="#38BDF8" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#gridenv)" />
                </svg>
                {envelope.qrImagePath ? (
                  <img
                    src={`${SOCKET_BASE_URL}/${envelope.qrImagePath}`}
                    alt={`QR code for ${envelope.envelopeCode}`}
                    className="relative w-40 h-40 rounded-lg bg-white p-2"
                  />
                ) : (
                  <div className="relative flex flex-col items-center gap-2 text-slate-600">
                    <QrCode size={48} />
                    <span className="text-xs">QR image not generated for this envelope</span>
                  </div>
                )}
                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                  <StatusBadge status={envelope.sealStatus} />
                  {/* Sprint Integration-1: distinct from sealStatus (see
                      schema.prisma's comment) -- reuses the existing
                      Badge component rather than extending StatusBadge's
                      shared statusColor map, which other pages also
                      depend on. */}
                  <Badge
                    variant={envelope.transportStatus === 'IN_TRANSIT' ? 'warning' : envelope.transportStatus === 'DELIVERED' ? 'primary' : 'neutral'}
                    dot
                  >
                    {envelope.transportStatus === 'IN_TRANSIT' ? 'In Transit' : envelope.transportStatus === 'DELIVERED' ? 'Delivered' : 'At Rest'}
                  </Badge>
                  {/* Architectural Integration sprint: the pre-dispatch
                      preparation lifecycle, a third, distinct status
                      dimension from sealStatus/transportStatus. */}
                  {envelope.prepStatus && (
                    <Badge variant={PREP_STATUS_VARIANT[envelope.prepStatus] || 'neutral'} dot>
                      {PREP_STATUS_LABELS[envelope.prepStatus] || envelope.prepStatus}
                    </Badge>
                  )}
                </div>
                {envelope.qrImagePath && (
                  <a
                    href={`${SOCKET_BASE_URL}/${envelope.qrImagePath}`}
                    download={`${envelope.envelopeCode}-qr.png`}
                    className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 bg-bg-card/90 hover:bg-bg-card border border-border text-xs text-slate-300 rounded-lg px-3 py-1.5"
                  >
                    <Download size={13} /> Download QR
                  </a>
                )}
              </div>
              <div className="p-5 flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-slate-500 text-xs">Envelope ID</p>
                  <p className="text-slate-100 font-mono font-medium">{envelope.envelopeCode}</p>
                </div>
                <div className="flex items-center gap-3 bg-bg-elevated border border-border rounded-xl px-4 py-2.5">
                  <QrCode size={28} className="text-slate-300" />
                  <div>
                    <p className="text-xs text-slate-500">QR Reference</p>
                    <p className="text-xs font-mono text-slate-300">{envelope.qrCode}</p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-display font-semibold text-slate-100 mb-4">Envelope Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Exam</span>
                  <span className="text-slate-200">{envelope.exam}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subject</span>
                  <span className="text-slate-200">{envelope.subject}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Center</span>
                  <span className="text-slate-200 text-right">{envelope.center}</span>
                </div>
                {/* Architectural Integration sprint: only present for
                    envelopes created via the batch pipeline -- an
                    envelope from the original single-creation endpoint
                    has neither, correctly. */}
                {envelope.examination && (
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="text-slate-400 flex items-center gap-2"><GraduationCap size={14} /> Examination</span>
                    <span className="text-slate-200 text-right">{envelope.examination.examName}</span>
                  </div>
                )}
                {envelope.batch && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Batch</span>
                    <span className="text-slate-200 text-right">{envelope.batch.count} envelope(s)</span>
                  </div>
                )}
                {/* Assigned Vehicle/Officer -- the most recent transport
                    session for this envelope, if any (AT_REST envelopes
                    have none yet, correctly showing nothing here). */}
                {transportHistory.length > 0 && (() => {
                  const latest = transportHistory[transportHistory.length - 1].session;
                  return (
                    <>
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <span className="text-slate-400 flex items-center gap-2"><Truck size={14} /> Assigned Vehicle</span>
                        <span className="text-slate-200 text-right">{latest.vehicle?.vehicleNumber || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-2"><User size={14} /> Assigned Officer</span>
                        <span className="text-slate-200 text-right">{latest.officer?.name || '—'}</span>
                      </div>
                    </>
                  );
                })()}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-slate-400 flex items-center gap-2"><User size={14} /> Created by</span>
                </div>
                <p className="text-slate-200">{envelope.createdBy?.name || 'Unknown'}</p>
                <p className="text-xs text-slate-500">{new Date(envelope.createdAt).toLocaleString()}</p>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <h3 className="font-display font-semibold text-slate-100 mb-4 flex items-center gap-2">
              <Truck size={16} className="text-primary-500" /> Chain of Custody
            </h3>
            {custody.length === 0 ? (
              <EmptyState icon={Truck} title="No custody events recorded yet" description="Events appear here as the envelope moves through the system." />
            ) : (
              <ol className="relative border-l border-border ml-2">
                {custody.map((event) => (
                  <li key={event.id} className="mb-5 ml-5 last:mb-0">
                    <span
                      className={`absolute -left-[7px] w-3 h-3 rounded-full ring-4 ring-bg-card ${
                        concerningEvents.has(event.eventType) ? 'bg-danger' : 'bg-primary-500'
                      }`}
                    />
                    <p className="text-sm text-slate-200 font-medium">{eventTypeLabel[event.eventType] || event.eventType}</p>
                    <p className="text-xs text-slate-500">{event.location}{event.officer?.name ? ` · ${event.officer.name}` : ''}</p>
                    <p className="text-xs text-slate-600">{new Date(event.timestamp).toLocaleString()}</p>
                    {event.remarks && <p className="text-xs text-slate-500 mt-1">{event.remarks}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <h3 className="font-display font-semibold text-slate-100 mb-4 flex items-center gap-2">
                <ShieldAlert size={16} className="text-primary-500" /> AI Observations
              </h3>
              <EmptyState
                icon={ShieldAlert}
                title="View in Envelope Scanner or QR Verification"
                description="This envelope's own AI scan results and confidence scores are shown inline on the Envelope Scanner and QR Verification pages at the moment of scanning."
              />
            </Card>

            <Card className="p-5">
              <h3 className="font-display font-semibold text-slate-100 mb-4 flex items-center gap-2">
                <ImageIcon size={16} className="text-primary-500" /> Evidence Gallery
              </h3>
              <EmptyState
                icon={ImageIcon}
                title="No evidence captured for this envelope yet"
                description="Evidence images are captured automatically during AI scans and QR handovers as they happen."
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
