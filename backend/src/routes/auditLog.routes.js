import { Router } from 'express';
import * as auditLogController from '../controllers/auditLog.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

// Not in the Phase 2 spec's literal endpoint list, but "Audit Logging" is a
// required section with no way to retrieve it otherwise — added as a small,
// clearly-flagged gap-fill rather than leaving the feature write-only.
router.get('/', authorize(ROLES.ADMINISTRATOR, ROLES.AUDITOR), auditLogController.listAuditLogs);

export default router;
