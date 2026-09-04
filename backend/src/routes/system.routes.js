import { Router } from 'express';
import * as systemController from '../controllers/system.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticate);

// Read-only, any authenticated role — same precedent as /dashboard/summary
// (a health overview isn't privileged data specific to one role).
router.get('/health', systemController.getSystemHealth);
router.get('/ai-health', systemController.getAiHealth);
router.get('/camera-health', systemController.getCameraHealth);

export default router;
