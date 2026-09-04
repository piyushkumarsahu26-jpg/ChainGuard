import { Router } from 'express';
import * as envelopeBatchController from '../controllers/envelopeBatch.controller.js';
import {
  generateBatchValidator, batchIdParamValidator, examinationIdParamValidator,
} from '../validators/envelopeBatch.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

// Same role set as envelope creation and Examination Setup -- Phase 2
// is a deliberate admin action, not a role this project introduces new.
router.post(
  '/',
  authorize(ROLES.ADMINISTRATOR, ROLES.PRINTING_OFFICER, ROLES.CHIEF_EXAMINATION_OFFICER),
  generateBatchValidator, validate,
  envelopeBatchController.generateBatch,
);

router.get('/:id', batchIdParamValidator, validate, envelopeBatchController.getBatch);
router.get('/:id/pdf', batchIdParamValidator, validate, envelopeBatchController.getBatchPdf);
router.post(
  '/:id/confirm-preparation',
  authorize(ROLES.ADMINISTRATOR, ROLES.PRINTING_OFFICER, ROLES.CHIEF_EXAMINATION_OFFICER),
  batchIdParamValidator, validate,
  envelopeBatchController.confirmPreparation,
);
router.get('/by-examination/:examinationId', examinationIdParamValidator, validate, envelopeBatchController.listBatchesForExamination);

export default router;
