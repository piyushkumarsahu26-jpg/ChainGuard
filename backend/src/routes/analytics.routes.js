import { Router } from 'express';
import * as analyticsController from '../controllers/analytics.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { confidenceTrendValidator } from '../validators/analytics.validator.js';

const router = Router();
router.use(authenticate);

// Read-only aggregate stats — available to any authenticated role, matching
// how /dashboard/summary is not further role-restricted beyond auth.
router.get('/scans-by-month', analyticsController.getScansByMonth);
router.get('/tamper-breakdown', analyticsController.getTamperBreakdown);
router.get('/confidence-trend', confidenceTrendValidator, validate, analyticsController.getConfidenceTrend);
router.get('/center-risk', analyticsController.getCenterRisk);
router.get('/camera-status', analyticsController.getCameraStatus);
router.get('/qr', analyticsController.getQrAnalytics);

export default router;
