import { Router } from 'express';
import * as vehicleController from '../controllers/vehicle.controller.js';
import { createVehicleValidator } from '../validators/vehicle.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { ROLES } from '../models/roles.model.js';

const router = Router();
router.use(authenticate);

router.get('/', vehicleController.listVehicles);
router.post('/', authorize(ROLES.ADMINISTRATOR), createVehicleValidator, validate, vehicleController.createVehicle);

export default router;
