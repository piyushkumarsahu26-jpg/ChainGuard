import { body } from 'express-validator';

export const createVehicleValidator = [
  body('vehicleNumber').trim().notEmpty().withMessage('vehicleNumber is required'),
  body('driverName').trim().notEmpty().withMessage('driverName is required'),
];
