import { Router } from 'express';
import * as cameraController from '../controllers/camera.controller.js';
import {
  createCameraValidator, updateCameraValidator,
  cameraIdParamValidator, heartbeatValidator,
} from '../validators/camera.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

router.post('/', authorize(ROLES.ADMINISTRATOR), createCameraValidator, validate, cameraController.createCamera);
router.get('/', cameraController.listCameras);
router.get('/:id', cameraIdParamValidator, validate, cameraController.getCamera);
router.patch('/:id', authorize(ROLES.ADMINISTRATOR), updateCameraValidator, validate, cameraController.updateCamera);
router.delete('/:id', authorize(ROLES.ADMINISTRATOR), cameraIdParamValidator, validate, cameraController.deleteCamera);

// Heartbeat can also be pinged by the AI_SYSTEM role or the camera agent itself.
router.post(
  '/:id/heartbeat',
  authorize(ROLES.ADMINISTRATOR, ROLES.AI_SYSTEM),
  heartbeatValidator, validate,
  cameraController.heartbeat,
);

export default router;
