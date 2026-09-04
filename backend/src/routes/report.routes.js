import { Router } from 'express';
import * as reportController from '../controllers/report.controller.js';
import { generateReportValidator, reportIdParamValidator } from '../validators/report.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

router.post(
  '/',
  authorize(ROLES.ADMINISTRATOR),
  generateReportValidator, validate,
  reportController.generateReport,
);

router.get('/', reportController.listReports);
router.get('/:id', reportIdParamValidator, validate, reportController.getReport);

export default router;
