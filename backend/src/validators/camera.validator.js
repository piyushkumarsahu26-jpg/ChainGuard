import { body, param } from 'express-validator';

export const createCameraValidator = [
  body('name').trim().notEmpty().withMessage('Camera name is required'),
  body('ipAddress').trim().notEmpty().withMessage('IP address is required'),
  body('fps').optional().isInt({ min: 1 }),
  body('resolution').optional().isString(),
];

export const updateCameraValidator = [
  param('id').isUUID().withMessage('Invalid camera id'),
  body('status').optional().isIn(['ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE']),
];

export const cameraIdParamValidator = [param('id').isUUID().withMessage('Invalid camera id')];

export const heartbeatValidator = [
  param('id').isUUID().withMessage('Invalid camera id'),
  body('status').isIn(['ONLINE', 'OFFLINE', 'DEGRADED', 'MAINTENANCE']).withMessage('Invalid status'),
];
