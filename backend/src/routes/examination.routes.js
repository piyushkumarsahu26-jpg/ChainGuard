import { Router } from 'express';
import * as examinationController from '../controllers/examination.controller.js';
import {
  createExaminationValidator, updateExaminationValidator,
  examinationIdParamValidator, listExaminationValidator,
} from '../validators/examination.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

// Phase 1 (Examination Setup): the same admin-facing roles already
// trusted to create envelopes (envelope.routes.js), plus
// CHIEF_EXAMINATION_OFFICER, since setting up exam metadata is squarely
// that role's real-world responsibility. No new role was introduced.
router.post(
  '/',
  authorize(ROLES.ADMINISTRATOR, ROLES.PRINTING_OFFICER, ROLES.CHIEF_EXAMINATION_OFFICER),
  createExaminationValidator, validate,
  examinationController.createExamination,
);

router.get('/', listExaminationValidator, validate, examinationController.listExaminations);
router.get('/:id', examinationIdParamValidator, validate, examinationController.getExamination);

router.patch(
  '/:id',
  authorize(ROLES.ADMINISTRATOR, ROLES.PRINTING_OFFICER, ROLES.CHIEF_EXAMINATION_OFFICER),
  updateExaminationValidator, validate,
  examinationController.updateExamination,
);

export default router;
