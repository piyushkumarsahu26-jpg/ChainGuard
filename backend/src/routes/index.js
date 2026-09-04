// Aggregates all feature routers under a single /api/v1 mount point.
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import envelopeRoutes from './envelope.routes.js';
import cameraRoutes from './camera.routes.js';
import detectionRoutes from './detection.routes.js';
import alertRoutes from './alert.routes.js';
import custodyRoutes from './custody.routes.js';
import reportRoutes from './report.routes.js';
import healthRoutes from './health.routes.js';
import dashboardRoutes from "./dashboard.routes.js";
import userRoutes from './user.routes.js';
import analyticsRoutes from './analytics.routes.js';
import auditLogRoutes from './auditLog.routes.js';
import evidenceRoutes from './evidence.routes.js';
import aiRoutes from './ai.routes.js';
import gpsRoutes from './gps.routes.js';
import vehicleRoutes from './vehicle.routes.js';
import transportRouteRoutes from './transportRoute.routes.js';
import examinationRoutes from './examination.routes.js';
import envelopeBatchRoutes from './envelopeBatch.routes.js';
import systemRoutes from './system.routes.js';
import intelligenceRoutes from './intelligence.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/envelopes', envelopeRoutes);
router.use('/cameras', cameraRoutes);
router.use('/detections', detectionRoutes);
router.use('/alerts', alertRoutes);
router.use('/custody', custodyRoutes);
router.use('/reports', reportRoutes);
router.use("/dashboard", dashboardRoutes);
router.use('/users', userRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/evidence', evidenceRoutes);
router.use('/ai', aiRoutes);
router.use('/gps', gpsRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/routes', transportRouteRoutes);
router.use('/examinations', examinationRoutes);
router.use('/envelope-batches', envelopeBatchRoutes);
router.use('/system', systemRoutes);
router.use('/intelligence', intelligenceRoutes);

export default router;
