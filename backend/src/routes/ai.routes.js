import { Router } from 'express';
import * as aiController from '../controllers/ai.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticate);

router.get('/health', aiController.getAiHealth);
router.get('/models', aiController.getAiModels);

export default router;
