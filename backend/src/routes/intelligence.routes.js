import { Router } from 'express';
import * as intelligenceController from '../controllers/intelligence.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticate);

router.get('/predictions', intelligenceController.getPredictions);

export default router;
