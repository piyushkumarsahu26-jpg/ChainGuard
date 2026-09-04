import { Router } from 'express';
import * as routeController from '../controllers/transportRoute.controller.js';
import { createRouteValidator, routeIdParamValidator } from '../validators/transportRoute.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

// Read — any authenticated role, matching /vehicles, /detections, etc.
router.get('/', routeController.listRoutes);
router.get('/:id', routeIdParamValidator, validate, routeController.getRoute);

// Write — Administrator only, matching vehicle.routes.js's own precedent
// (registering fixed infrastructure like vehicles/routes is an admin
// action, distinct from the day-to-day transport-officer actions in
// gps.routes.js).
router.post('/', authorize(ROLES.ADMINISTRATOR), createRouteValidator, validate, routeController.createRoute);

export default router;
