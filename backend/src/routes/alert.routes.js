import { Router } from 'express';
import * as alertController from '../controllers/alert.controller.js';
import {
  createAlertValidator, updateAlertValidator, alertIdParamValidator,
} from '../validators/alert.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  authorize(ROLES.ADMINISTRATOR, ROLES.AI_SYSTEM),
  createAlertValidator, validate,
  alertController.createAlert,
);

router.get('/', alertController.listAlerts);
router.get('/:id', alertIdParamValidator, validate, alertController.getAlert);

router.patch(
  '/:id',
  authorize(ROLES.ADMINISTRATOR, ROLES.EXAM_CENTER_OFFICER),
  updateAlertValidator, validate,
  alertController.updateAlert,
);

router.post(
  '/:id/resolve',
  authorize(ROLES.ADMINISTRATOR, ROLES.EXAM_CENTER_OFFICER),
  alertIdParamValidator, validate,
  alertController.resolveAlert,
);

export default router;
