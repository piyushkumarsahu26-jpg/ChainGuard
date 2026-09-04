// Prisma seed script
// Run with: npm run prisma:seed
import {
  PrismaClient,
  Role,
  CameraStatus,
  SealStatus,
  AlertSeverity,
  AlertStatus,
} from '@prisma/client';
import bcrypt from 'bcrypt';
import 'dotenv/config';
import { examinationService } from '../src/services/examination.service.js';
import { envelopeBatchService } from '../src/services/envelopeBatch.service.js';

const prisma = new PrismaClient();

async function main() {
  // ------------------------------------------------------------------
  // USERS (existing logic — unchanged)
  // ------------------------------------------------------------------
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@chainguard.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'System Administrator',
      email: adminEmail,
      passwordHash,
      role: Role.ADMINISTRATOR,
    },
  });

  const officerDefs = [
    { name: 'Printing Officer', email: 'printing.officer@chainguard.local', role: Role.PRINTING_OFFICER, employeeId: 'EMP-1001', department: 'Printing' },
    { name: 'Transport Officer', email: 'transport.officer@chainguard.local', role: Role.TRANSPORT_OFFICER, employeeId: 'EMP-1002', department: 'Transport' },
    { name: 'Exam Center Officer', email: 'center.officer@chainguard.local', role: Role.EXAM_CENTER_OFFICER, employeeId: 'EMP-1003', department: 'Examination Centre' },
    // Phase 2: one demo user per newly-added role, so the expanded Role
    // enum has real accounts to log in with, not just theoretical values.
    { name: 'Chief Examination Officer', email: 'chief.examiner@chainguard.local', role: Role.CHIEF_EXAMINATION_OFFICER, employeeId: 'EMP-1004', department: 'Examination Board' },
    { name: 'Storage Officer', email: 'storage.officer@chainguard.local', role: Role.STORAGE_OFFICER, employeeId: 'EMP-1005', department: 'Storage' },
    { name: 'System Auditor', email: 'auditor@chainguard.local', role: Role.AUDITOR, employeeId: 'EMP-1006', department: 'Compliance' },
    { name: 'Read-Only Viewer', email: 'viewer@chainguard.local', role: Role.VIEWER, employeeId: 'EMP-1007', department: 'Compliance' },
  ];

  const officers = [];
  for (const officer of officerDefs) {
    const hash = await bcrypt.hash('ChangeMe123!', 12);
    const record = await prisma.user.upsert({
      where: { email: officer.email },
      update: {},
      create: { ...officer, passwordHash: hash, createdById: admin.id },
    });
    officers.push(record);
  }

  const printingOfficer = officers.find((o) => o.role === Role.PRINTING_OFFICER) || admin;

  console.log('Seed complete. Admin user:', admin.email);

  // ------------------------------------------------------------------
  // CAMERAS
  // ------------------------------------------------------------------
  // Camera has no unique field besides `id`, so upsert isn't usable here
  // (Prisma's upsert requires a unique `where`). Using find-by-name then
  // create instead, which is idempotent across repeated seed runs.
  const cameraDefs = [
    {
      name: 'Camera 01 - Printing Press Entrance',
      ipAddress: '192.168.10.11',
      location: 'Printing Press - Entrance',
      status: CameraStatus.ONLINE,
      fps: 30,
      resolution: '1920x1080',
      lastHeartbeat: new Date(),
    },
    {
      name: 'Camera 02 - Printing Press Production Floor',
      ipAddress: '192.168.10.12',
      location: 'Printing Press - Production Floor',
      status: CameraStatus.ONLINE,
      fps: 25,
      resolution: '1920x1080',
      lastHeartbeat: new Date(Date.now() - 2 * 60 * 1000),
    },
    {
      name: 'Camera 03 - Loading Dock',
      ipAddress: '192.168.10.13',
      location: 'Printing Press - Loading Dock',
      status: CameraStatus.OFFLINE,
      fps: 24,
      resolution: '1280x720',
      lastHeartbeat: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
    {
      name: 'Camera 04 - Transport Vehicle Bay',
      ipAddress: '192.168.10.14',
      location: 'Transport Hub - Vehicle Bay',
      status: CameraStatus.ONLINE,
      fps: 30,
      resolution: '1920x1080',
      lastHeartbeat: new Date(Date.now() - 30 * 1000),
    },
    {
      name: 'Camera 05 - Exam Center Storage Room',
      ipAddress: '192.168.10.15',
      location: 'Exam Center - Storage Room',
      status: CameraStatus.OFFLINE,
      fps: 20,
      resolution: '1280x720',
      lastHeartbeat: new Date(Date.now() - 6 * 60 * 60 * 1000),
    },
  ];

  const cameras = [];
  for (const def of cameraDefs) {
    let camera = await prisma.camera.findFirst({ where: { name: def.name } });
    if (!camera) {
      camera = await prisma.camera.create({ data: def });
    }
    cameras.push(camera);
  }

  console.log(`Seeded ${cameras.length} cameras.`);

  // ------------------------------------------------------------------
  // ENVELOPES
  // ------------------------------------------------------------------
  // envelopeCode and qrCode are both @unique in schema.prisma, so upsert
  // is the correct, idempotent tool here.
  const envelopeDefs = [
    { envelopeCode: 'ENV-2026-BIO-0001', subject: 'Biology', sealStatus: SealStatus.SEALED, center: 'Exam Center - Sector 12' },
    { envelopeCode: 'ENV-2026-CHM-0002', subject: 'Chemistry', sealStatus: SealStatus.SEALED, center: 'Exam Center - Sector 12' },
    { envelopeCode: 'ENV-2026-PHY-0003', subject: 'Physics', sealStatus: SealStatus.SEALED, center: 'Exam Center - Sector 7' },
    { envelopeCode: 'ENV-2026-MATH-0004', subject: 'Mathematics', sealStatus: SealStatus.BROKEN, center: 'Exam Center - Sector 7' },
    { envelopeCode: 'ENV-2026-ENG-0005', subject: 'English', sealStatus: SealStatus.TAMPERED, center: 'Exam Center - Model Town' },
    { envelopeCode: 'ENV-2026-CS-0006', subject: 'Computer Science', sealStatus: SealStatus.OPENED, center: 'Exam Center - Model Town' },
    { envelopeCode: 'ENV-2026-ECO-0007', subject: 'Economics', sealStatus: SealStatus.SEALED, center: 'Exam Center - Sector 12' },
    { envelopeCode: 'ENV-2026-HIS-0008', subject: 'History', sealStatus: SealStatus.SEALED, center: 'Exam Center - Sector 7' },
    { envelopeCode: 'ENV-2026-GEO-0009', subject: 'Geography', sealStatus: SealStatus.BROKEN, center: 'Exam Center - Model Town' },
    { envelopeCode: 'ENV-2026-ACC-0010', subject: 'Accountancy', sealStatus: SealStatus.SEALED, center: 'Exam Center - Sector 12' },
  ];

  const envelopes = [];
  // Real pipeline's envelope codes are auto-generated
  // (ENV-{timestamp}-{random}), not the fixed def.envelopeCode values
  // below -- a per-envelope "does this exact code already exist" check
  // would never match on a re-run, silently creating 10 more demo
  // envelopes every time this script runs. Guarded once, up front,
  // matching the same whole-block idempotency pattern already used for
  // alerts/detections/audit logs elsewhere in this file.
  const existingEnvelopeCount = await prisma.envelope.count();
  if (existingEnvelopeCount === 0) {
    for (const def of envelopeDefs) {
      // Architectural Integration sprint (the user's explicit
      // instruction): "demo envelopes should already be in a valid
      // READY_FOR_DISPATCH state... without requiring manual
      // preparation." Routes through the exact same real pipeline a
      // real operator uses -- examination.service.js's create(),
      // envelopeBatch.service.js's generateBatch()/recordPrint()/
      // confirmPreparation() -- rather than a parallel raw-Prisma
      // shortcut that would leave seeded envelopes permanently unable
      // to be dispatched (Phase 5's own new gate).
      //
      // One Examination per envelope, not one shared across all ten:
      // a real examination has exactly one subject/centre/date, so
      // this is the realistic shape, not a compromise -- and it
      // preserves every envelope's own distinct subject/centre exactly
      // as this file already defined them.
      const examination = await examinationService.create({
        state: 'Demo State',
        city: 'Demo City',
        centre: def.center,
        examName: 'Board Examination 2026',
        subject: def.subject,
        examDate: new Date('2026-12-15'),
        examTime: '10:00 AM',
        officerId: printingOfficer.id,
        createdById: printingOfficer.id,
      });
      const { batch, envelopes: batchEnvelopes } = await envelopeBatchService.generateBatch({
        examinationId: examination.id,
        count: 1,
        generatedById: printingOfficer.id,
      });
      await envelopeBatchService.recordPrint(batch.id, printingOfficer.id); // marks QR_PRINTED -- the real trigger, not a shortcut
      await envelopeBatchService.confirmPreparation(batch.id, printingOfficer.id); // the explicit confirmation Phase 4's own correction requires -- advances to READY_FOR_DISPATCH

      // sealStatus is applied after the fact, since the real pipeline
      // always starts an envelope at SEALED (correct default); this
      // file's own varied SEALED/BROKEN/TAMPERED/OPENED demo mix
      // represents envelopes that have already been through a real AI
      // scan finding something, which is demo-only context this seed
      // script has always synthesized, not a claim a real scan ran.
      const envelope = await prisma.envelope.update({
        where: { id: batchEnvelopes[0].id },
        data: { sealStatus: def.sealStatus },
      });
      envelopes.push(envelope);
    }
    console.log(`Seeded ${envelopes.length} envelopes (READY_FOR_DISPATCH, via the real Examination/Batch/Print/Confirm pipeline).`);
  } else {
    const existing = await prisma.envelope.findMany({ take: envelopeDefs.length, orderBy: { createdAt: 'asc' } });
    envelopes.push(...existing);
    console.log('Envelopes already seeded — skipping.');
  }

  console.log(`Seeded ${envelopes.length} envelopes.`);

  // ------------------------------------------------------------------
  // AI DETECTIONS
  // ------------------------------------------------------------------
  // No natural unique key on Detection, so we guard against duplicate
  // runs by only seeding when the table is empty.
  const existingDetectionCount = await prisma.detection.count();

  const predictionLabels = [
    'seal_intact',
    'seal_tampered',
    'envelope_present',
    'envelope_missing',
    'suspicious_movement',
    'unauthorized_access',
    'normal_activity',
    'person_detected',
    'tampering_attempt',
  ];

  const randomBetween = (min, max) => Math.random() * (max - min) + min;
  const randomBoundingBox = () => ({
    x: Number(randomBetween(0.05, 0.6).toFixed(3)),
    y: Number(randomBetween(0.05, 0.5).toFixed(3)),
    width: Number(randomBetween(0.15, 0.35).toFixed(3)),
    height: Number(randomBetween(0.2, 0.45).toFixed(3)),
  });
  const randomPastTimestamp = (maxHoursAgo) =>
    new Date(Date.now() - Math.floor(Math.random() * maxHoursAgo * 60 * 60 * 1000));

  let detections = [];

  if (existingDetectionCount === 0) {
    const detectionDefs = Array.from({ length: 15 }, (_, i) => {
      const camera = cameras[i % cameras.length];
      const prediction = predictionLabels[Math.floor(Math.random() * predictionLabels.length)];
      const confidence = Number(randomBetween(0.6, 0.99).toFixed(2));

      return {
        cameraId: camera.id,
        prediction,
        confidence,
        boundingBox: randomBoundingBox(),
        imagePath: `/uploads/detections/detection-${i + 1}.jpg`,
        timestamp: randomPastTimestamp(168), // spread across the last 7 days
      };
    });

    detections = await Promise.all(
      detectionDefs.map((data) => prisma.detection.create({ data }))
    );

    console.log(`Seeded ${detections.length} AI detections.`);
  } else {
    detections = await prisma.detection.findMany({ take: 15 });
    console.log('Detections already seeded — skipping.');
  }

  // ------------------------------------------------------------------
  // ALERTS
  // ------------------------------------------------------------------
  // No natural unique key on Alert either — same empty-table guard.
  const existingAlertCount = await prisma.alert.count();

  if (existingAlertCount === 0 && detections.length > 0) {
    // Pick a handful of detections to "escalate" into alerts, mirroring
    // the real auto-alert logic in detection.service.js (confidence-based
    // HIGH/CRITICAL split), but crafted directly here for demo variety.
    const alertSourceDetections = detections.slice(0, 6);

    const alertDefs = alertSourceDetections.map((detection, i) => {
      const severity = detection.confidence >= 0.9 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH;
      const isResolved = i % 3 === 0; // roughly 1/3 resolved, rest open
      const linkedEnvelope = envelopes[i % envelopes.length];

      return {
        severity,
        status: isResolved ? AlertStatus.RESOLVED : AlertStatus.OPEN,
        title: `Suspicious activity detected: ${detection.prediction}`,
        description: `AI system flagged "${detection.prediction}" with ${(detection.confidence * 100).toFixed(1)}% confidence.`,
        detectionId: detection.id,
        cameraId: detection.cameraId,
        // Only some alerts are tied to a specific envelope, since a
        // detection itself has no envelope relation in the schema.
        envelopeId: i % 2 === 0 ? linkedEnvelope.id : null,
        resolvedById: isResolved ? admin.id : null,
        resolvedTime: isResolved ? new Date() : null,
      };
    });

    const alerts = await Promise.all(
      alertDefs.map((data) => prisma.alert.create({ data }))
    );

    console.log(`Seeded ${alerts.length} alerts.`);

    // QR Verification & Digital Authentication sprint: a small set of
    // demo QR-category alerts, same guard (existingAlertCount === 0) so
    // re-running the seed script doesn't duplicate them. Not tied to a
    // real scan (this is seed data, not a live event), but uses the
    // exact same category values and title/description conventions
    // raiseQrAlert() itself uses, so they render identically to a real
    // one in Alert Center / Notification Center / QR Analytics.
    const qrAlertDefs = [
      {
        severity: AlertSeverity.HIGH,
        status: AlertStatus.OPEN,
        category: 'DUPLICATE_SCAN',
        title: `Duplicate scan detected: ${envelopes[0].envelopeCode}`,
        description: 'Scanned again 42s after a prior scan by a different officer/device.',
        envelopeId: envelopes[0].id,
      },
      {
        severity: AlertSeverity.CRITICAL,
        status: AlertStatus.RESOLVED,
        category: 'SIGNATURE_FAILURE',
        title: `QR signature invalid: ${envelopes[1].envelopeCode}`,
        description: "The scanned QR's cryptographic signature does not match its content -- possible forgery or corruption.",
        envelopeId: envelopes[1].id,
        resolvedById: admin.id,
        resolvedTime: new Date(),
      },
    ];
    await Promise.all(qrAlertDefs.map((data) => prisma.alert.create({ data })));
    console.log(`Seeded ${qrAlertDefs.length} QR-category demo alerts.`);
  } else {
    console.log('Alerts already seeded — skipping.');
  }

  // ------------------------------------------------------------------
  // AUDIT LOGS (Phase 2)
  // ------------------------------------------------------------------
  const existingAuditCount = await prisma.auditLog.count();
  if (existingAuditCount === 0) {
    const auditDefs = [
      { action: 'USER_CREATED', actorId: admin.id, targetUserId: printingOfficer.id, ipAddress: '127.0.0.1', metadata: { email: printingOfficer.email, role: printingOfficer.role } },
      { action: 'LOGIN', actorId: admin.id, ipAddress: '127.0.0.1' },
      { action: 'LOGIN_FAILED', ipAddress: '203.0.113.42', metadata: { email: 'unknown@chainguard.local' } },
    ];
    await Promise.all(auditDefs.map((data) => prisma.auditLog.create({ data })));
    console.log(`Seeded ${auditDefs.length} audit log entries.`);
  } else {
    console.log('Audit logs already seeded — skipping.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });