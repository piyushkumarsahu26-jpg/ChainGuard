import { Router } from 'express';
import * as gpsController from '../controllers/gps.controller.js';
import {
  startTransportValidator,
  updateLocationValidator,
  stopTransportValidator,
  pauseTransportValidator,
  resumeTransportValidator,
  sessionIdParamValidator,
  envelopeIdParamValidator,
} from '../validators/gps.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

// Mutating endpoints — Transport Officer or Administrator, matching the
// role scope already used for envelope-transport-adjacent actions
// elsewhere in this project (e.g. envelope.routes.js's scan endpoint).
// AI_SYSTEM is also allowed on /update only, for a future device/IoT
// integration path — consistent with how /detections already allows
// AI_SYSTEM alongside human roles.
router.post(
  '/start',
  authorize(ROLES.TRANSPORT_OFFICER, ROLES.ADMINISTRATOR),
  startTransportValidator,
  validate,
  gpsController.startTransport
);
router.post(
  '/pause',
  authorize(ROLES.TRANSPORT_OFFICER, ROLES.ADMINISTRATOR),
  pauseTransportValidator,
  validate,
  gpsController.pauseTransport
);
router.post(
  '/resume',
  authorize(ROLES.TRANSPORT_OFFICER, ROLES.ADMINISTRATOR),
  resumeTransportValidator,
  validate,
  gpsController.resumeTransport
);
router.post(
  '/update',
  authorize(ROLES.TRANSPORT_OFFICER, ROLES.ADMINISTRATOR, ROLES.AI_SYSTEM),
  updateLocationValidator,
  validate,
  gpsController.updateLocation
);
router.post(
  '/stop',
  authorize(ROLES.TRANSPORT_OFFICER, ROLES.ADMINISTRATOR),
  stopTransportValidator,
  validate,
  gpsController.stopTransport
);

// Read endpoints — any authenticated role, matching /detections, /alerts, etc.
router.get('/live', gpsController.getLive);
router.get('/history/by-envelope/:envelopeId', envelopeIdParamValidator, validate, gpsController.getHistoryByEnvelope);
router.get('/history/:sessionId', sessionIdParamValidator, validate, gpsController.getHistory);

export default router;
