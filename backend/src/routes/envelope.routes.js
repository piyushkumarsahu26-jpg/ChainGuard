import { Router } from 'express';
import * as envelopeController from '../controllers/envelope.controller.js';
import {
  createEnvelopeValidator, updateEnvelopeValidator,
  envelopeIdParamValidator, listEnvelopeValidator,
} from '../validators/envelope.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  authorize(ROLES.ADMINISTRATOR, ROLES.PRINTING_OFFICER),
  createEnvelopeValidator, validate,
  envelopeController.createEnvelope,
);

router.get('/', listEnvelopeValidator, validate, envelopeController.listEnvelopes);

// IMPORTANT: '/centers' must be registered before '/:id', otherwise
// Express matches it as GET /:id with id === "centers".
router.get('/centers', envelopeController.listCenters);

router.get('/:id', envelopeIdParamValidator, validate, envelopeController.getEnvelope);

router.patch(
  '/:id',
  authorize(ROLES.ADMINISTRATOR, ROLES.PRINTING_OFFICER, ROLES.TRANSPORT_OFFICER, ROLES.EXAM_CENTER_OFFICER),
  updateEnvelopeValidator, validate,
  envelopeController.updateEnvelope,
);

// The on-demand Scanner flow (Sprint AI-4B). Same role set as PATCH :id —
// any officer who can update an envelope's status can also scan it.
router.post(
  '/:id/scan',
  authorize(ROLES.ADMINISTRATOR, ROLES.PRINTING_OFFICER, ROLES.TRANSPORT_OFFICER, ROLES.EXAM_CENTER_OFFICER),
  envelopeIdParamValidator, validate,
  upload.single('file'),
  envelopeController.scanEnvelope,
);

// Sprint 8, Part 4 (Risk Score) — read-only, any authenticated role, same
// precedent as GET /:id itself.
router.get(
  '/:id/risk-score',
  envelopeIdParamValidator, validate,
  envelopeController.getRiskScore,
);

router.delete(
  '/:id',
  authorize(ROLES.ADMINISTRATOR),
  envelopeIdParamValidator, validate,
  envelopeController.deleteEnvelope,
);

export default router;
