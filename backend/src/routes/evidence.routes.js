import { Router } from 'express';
import * as evidenceController from '../controllers/evidence.controller.js';
import { evidenceIdParamValidator } from '../validators/evidence.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authenticate);

// No POST route here — Evidence is created internally by
// envelopeService.scan() (Sprint AI-4B's Evidence Pipeline), not via a
// direct public upload endpoint. This avoids a second, parallel upload
// path that would need its own AI-submission/detection-creation logic
// duplicated from envelope.service.js.
router.get('/', evidenceController.listEvidence);
router.get('/:id', evidenceIdParamValidator, validate, evidenceController.getEvidence);

export default router;
