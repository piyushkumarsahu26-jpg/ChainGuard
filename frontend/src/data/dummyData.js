// Central dummy/mock data for the ChainGuard demo frontend.

export const statuses = ['Sealed', 'Opened', 'Torn', 'Crushed', 'Taped', 'Partially Damaged'];

export const statusColor = {
  Sealed: { text: 'text-primary-500', bg: 'bg-primary-500/10', ring: 'ring-primary-500/30', dot: 'bg-primary-500' },
  Opened: { text: 'text-warning', bg: 'bg-warning/10', ring: 'ring-warning/30', dot: 'bg-warning' },
  Torn: { text: 'text-danger', bg: 'bg-danger/10', ring: 'ring-danger/30', dot: 'bg-danger' },
  Crushed: { text: 'text-danger', bg: 'bg-danger/10', ring: 'ring-danger/30', dot: 'bg-danger' },
  Taped: { text: 'text-accent', bg: 'bg-accent/10', ring: 'ring-accent/30', dot: 'bg-accent' },
  'Partially Damaged': { text: 'text-warning', bg: 'bg-warning/10', ring: 'ring-warning/30', dot: 'bg-warning' },
  // Real backend SealStatus enum values (Envelope.sealStatus) — added so
  // StatusBadge renders correctly for live data, not just the dummy set above.
  SEALED: { text: 'text-primary-500', bg: 'bg-primary-500/10', ring: 'ring-primary-500/30', dot: 'bg-primary-500' },
  BROKEN: { text: 'text-danger', bg: 'bg-danger/10', ring: 'ring-danger/30', dot: 'bg-danger' },
  TAMPERED: { text: 'text-danger', bg: 'bg-danger/10', ring: 'ring-danger/30', dot: 'bg-danger' },
  OPENED: { text: 'text-warning', bg: 'bg-warning/10', ring: 'ring-warning/30', dot: 'bg-warning' },
};

export const cameras = [
  { id: 'CAM-01', name: 'Printing Room A', location: 'Central Press, Bay 1', status: 'Online', fps: 29, resolution: '1920x1080', lastMaintenance: '2026-06-12' },
  { id: 'CAM-02', name: 'Printing Room B', location: 'Central Press, Bay 2', status: 'Online', fps: 30, resolution: '1920x1080', lastMaintenance: '2026-06-12' },
  { id: 'CAM-03', name: 'Sealing Unit', location: 'Central Press, Sealing Floor', status: 'Online', fps: 28, resolution: '2560x1440', lastMaintenance: '2026-05-30' },
  { id: 'CAM-04', name: 'Loading Dock', location: 'Central Press, Dock 3', status: 'Offline', fps: 0, resolution: '1920x1080', lastMaintenance: '2026-04-18' },
  { id: 'CAM-05', name: 'Transit Van 12', location: 'En route — NH-44', status: 'Online', fps: 24, resolution: '1280x720', lastMaintenance: '2026-06-01' },
  { id: 'CAM-06', name: 'District Store Room', location: 'Jabalpur District Hub', status: 'Online', fps: 30, resolution: '1920x1080', lastMaintenance: '2026-06-20' },
  { id: 'CAM-07', name: 'Exam Center Gate', location: 'Govt. Model School, Gate 2', status: 'Online', fps: 27, resolution: '1920x1080', lastMaintenance: '2026-06-15' },
  { id: 'CAM-08', name: 'Exam Center Vault', location: 'Govt. Model School, Vault Room', status: 'Maintenance', fps: 0, resolution: '1920x1080', lastMaintenance: '2026-07-20' },
];

export const envelopes = [
  { id: 'ENV-48213', status: 'Sealed', confidence: 99.2, center: 'Govt. Model School', officer: 'R. Verma', lastSeen: '2 min ago', camera: 'CAM-07' },
  { id: 'ENV-48214', status: 'Sealed', confidence: 98.7, center: 'St. Xavier School', officer: 'A. Nair', lastSeen: '3 min ago', camera: 'CAM-06' },
  { id: 'ENV-48215', status: 'Taped', confidence: 91.4, center: 'District Hub', officer: 'S. Iyer', lastSeen: '5 min ago', camera: 'CAM-06' },
  { id: 'ENV-48216', status: 'Torn', confidence: 96.8, center: 'Transit Van 12', officer: 'M. Khan', lastSeen: '8 min ago', camera: 'CAM-05' },
  { id: 'ENV-48217', status: 'Sealed', confidence: 99.6, center: 'Central Press', officer: 'D. Sharma', lastSeen: '11 min ago', camera: 'CAM-03' },
  { id: 'ENV-48218', status: 'Crushed', confidence: 88.3, center: 'Loading Dock', officer: 'P. Joshi', lastSeen: '14 min ago', camera: 'CAM-04' },
  { id: 'ENV-48219', status: 'Opened', confidence: 94.1, center: 'Govt. Model School', officer: 'R. Verma', lastSeen: '19 min ago', camera: 'CAM-07' },
  { id: 'ENV-48220', status: 'Partially Damaged', confidence: 82.5, center: 'District Hub', officer: 'S. Iyer', lastSeen: '22 min ago', camera: 'CAM-06' },
];

export const alerts = [
  {
    id: 'ALT-9021',
    severity: 'Critical',
    title: 'Seal breach detected',
    envelope: 'ENV-48216',
    location: 'Transit Van 12 — NH-44',
    time: '8 min ago',
    status: 'Open',
    description: 'AI vision model flagged a torn seal with 96.8% confidence during transit scan.',
  },
  {
    id: 'ALT-9020',
    severity: 'Critical',
    title: 'Unexpected opening event',
    envelope: 'ENV-48219',
    location: 'Govt. Model School, Gate 2',
    time: '19 min ago',
    status: 'Open',
    description: 'Envelope marked opened outside scheduled distribution window.',
  },
  {
    id: 'ALT-9019',
    severity: 'Warning',
    title: 'Crush damage suspected',
    envelope: 'ENV-48218',
    location: 'Central Press, Dock 3',
    time: '14 min ago',
    status: 'Investigating',
    description: 'Deformation detected on envelope surface during dock handoff.',
  },
  {
    id: 'ALT-9018',
    severity: 'Warning',
    title: 'Tamper tape reapplied',
    envelope: 'ENV-48215',
    location: 'District Hub',
    time: '5 min ago',
    status: 'Investigating',
    description: 'Secondary tape layer detected — inconsistent with sealing protocol.',
  },
  {
    id: 'ALT-9017',
    severity: 'Info',
    title: 'Camera offline',
    envelope: '—',
    location: 'Central Press, Dock 3',
    time: '1 hr ago',
    status: 'Resolved',
    description: 'CAM-04 lost connection for 6 minutes during routine restart.',
  },
  {
    id: 'ALT-9016',
    severity: 'Info',
    title: 'Model auto-updated',
    envelope: '—',
    location: 'System',
    time: '3 hr ago',
    status: 'Resolved',
    description: 'Detection model updated to v4.2.1 with improved tape recognition.',
  },
];

export const activityTimeline = [
  { time: '10:42 AM', text: 'ENV-48213 scanned — Sealed', tag: 'scan' },
  { time: '10:39 AM', text: 'ENV-48219 flagged — Opened outside window', tag: 'alert' },
  { time: '10:35 AM', text: 'CAM-06 detected ENV-48215 — Taped', tag: 'alert' },
  { time: '10:28 AM', text: 'Officer S. Iyer logged handoff at District Hub', tag: 'log' },
  { time: '10:20 AM', text: 'ENV-48217 printed and sealed at Central Press', tag: 'scan' },
  { time: '10:05 AM', text: 'CAM-04 restored connection', tag: 'system' },
];

export const dailyScans = [
  { day: 'Mon', scans: 412, tampered: 6 },
  { day: 'Tue', scans: 528, tampered: 9 },
  { day: 'Wed', scans: 487, tampered: 4 },
  { day: 'Thu', scans: 601, tampered: 11 },
  { day: 'Fri', scans: 573, tampered: 7 },
  { day: 'Sat', scans: 349, tampered: 3 },
  { day: 'Sun', scans: 210, tampered: 1 },
];

export const monthlyScans = [
  { month: 'Feb', scans: 9800 },
  { month: 'Mar', scans: 11200 },
  { month: 'Apr', scans: 10400 },
  { month: 'May', scans: 13800 },
  { month: 'Jun', scans: 15200 },
  { month: 'Jul', scans: 12760 },
];

export const tamperBreakdown = [
  { name: 'Torn', value: 34 },
  { name: 'Opened', value: 26 },
  { name: 'Crushed', value: 18 },
  { name: 'Taped', value: 14 },
  { name: 'Partially Damaged', value: 8 },
];

export const centerRisk = [
  { center: 'Govt. Model School', incidents: 14 },
  { center: 'District Hub', incidents: 11 },
  { center: 'St. Xavier School', incidents: 7 },
  { center: 'Transit Van 12', incidents: 9 },
  { center: 'Central Press', incidents: 4 },
];

export const accuracyTrend = [
  { day: '1', accuracy: 97.1 },
  { day: '5', accuracy: 97.6 },
  { day: '10', accuracy: 98.0 },
  { day: '15', accuracy: 98.3 },
  { day: '20', accuracy: 98.6 },
  { day: '25', accuracy: 99.0 },
  { day: '30', accuracy: 99.1 },
];

export const cameraUptime = [
  { name: 'CAM-01', uptime: 99.8 },
  { name: 'CAM-02', uptime: 99.4 },
  { name: 'CAM-03', uptime: 98.9 },
  { name: 'CAM-04', uptime: 91.2 },
  { name: 'CAM-05', uptime: 96.5 },
  { name: 'CAM-06', uptime: 99.1 },
  { name: 'CAM-07', uptime: 99.6 },
  { name: 'CAM-08', uptime: 94.3 },
];

export const modelStats = {
  version: 'v4.2.1',
  accuracy: 99.1,
  precision: 98.4,
  recall: 97.9,
  inferenceTimeMs: 42,
  gpuUtilization: 63,
};

export const envelopeDetail = {
  id: 'ENV-48216',
  status: 'Torn',
  sealIntegrityScore: 41,
  damageProbability: 96.8,
  center: 'Transit Van 12',
  qrValue: 'CG-ENV-48216-2026',
  officer: { name: 'M. Khan', id: 'OFC-1187', shift: 'Transit — Route 4' },
  transportHistory: [
    { stage: 'Printed & Sealed', location: 'Central Press, Bay 2', time: 'Jul 26, 06:10 AM', status: 'Sealed' },
    { stage: 'Dock Handoff', location: 'Central Press, Dock 3', time: 'Jul 26, 07:45 AM', status: 'Sealed' },
    { stage: 'In Transit', location: 'NH-44, KM 212', time: 'Jul 26, 09:58 AM', status: 'Sealed' },
    { stage: 'Tamper Detected', location: 'NH-44, KM 240', time: 'Jul 26, 10:34 AM', status: 'Torn' },
  ],
  detectionHistory: [
    { time: '10:34 AM', model: 'v4.2.1', result: 'Torn', confidence: 96.8 },
    { time: '09:58 AM', model: 'v4.2.1', result: 'Sealed', confidence: 99.4 },
    { time: '07:45 AM', model: 'v4.2.0', result: 'Sealed', confidence: 99.1 },
  ],
  aiObservations: [
    'Tear line detected along the top-right seam, ~4.2cm span.',
    'Adhesive residue pattern inconsistent with factory seal.',
    'No secondary tape reinforcement observed post-tear.',
  ],
};

export const reportPresets = [
  { id: 'RPT-01', name: 'Weekly Tamper Summary', lastGenerated: 'Jul 21, 2026' },
  { id: 'RPT-02', name: 'District Hub Compliance', lastGenerated: 'Jul 18, 2026' },
  { id: 'RPT-03', name: 'Camera Uptime Audit', lastGenerated: 'Jul 10, 2026' },
];

export const detectionCenters = [
  'Govt. Model School',
  'St. Xavier School',
  'District Hub',
  'Transit Van 12',
  'Central Press',
];

export const officers = ['R. Verma', 'A. Nair', 'S. Iyer', 'M. Khan', 'D. Sharma', 'P. Joshi'];
