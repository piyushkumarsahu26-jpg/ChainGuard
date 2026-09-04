import { Router } from 'express';
import * as detectionController from '../controllers/detection.controller.js';
import { createDetectionValidator, detectionIdParamValidator } from '../validators/detection.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

// Only the AI System (FastAPI service, using a service account JWT) or an
// Administrator may submit detections.
router.post(
  '/',
  authorize(ROLES.AI_SYSTEM, ROLES.ADMINISTRATOR),
  createDetectionValidator, validate,
  detectionController.createDetection,
);

router.get('/', detectionController.listDetections);
router.get('/:id', detectionIdParamValidator, validate, detectionController.getDetection);

export default router;
