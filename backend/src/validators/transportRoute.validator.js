import { body, param } from 'express-validator';

export const createRouteValidator = [
  body('name').trim().notEmpty().withMessage('Route name is required'),
  body('description').optional().isString(),
  body('estimatedDurationMinutes').optional().isInt({ min: 1 }),
  body('checkpoints').isArray({ min: 2 }).withMessage('At least 2 checkpoints are required'),
  body('checkpoints.*.name').trim().notEmpty().withMessage('Each checkpoint needs a name'),
  body('checkpoints.*.latitude').isFloat({ min: -90, max: 90 }),
  body('checkpoints.*.longitude').isFloat({ min: -180, max: 180 }),
  body('checkpoints.*.radiusMeters').optional().isInt({ min: 10 }),
];

export const routeIdParamValidator = [param('id').isUUID().withMessage('Invalid route id')];
