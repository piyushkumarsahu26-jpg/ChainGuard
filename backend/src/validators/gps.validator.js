import { body, param } from 'express-validator';

export const startTransportValidator = [
  body('envelopeId').isUUID().withMessage('envelopeId is required and must be a valid UUID'),
  body('officerId').isUUID().withMessage('officerId is required and must be a valid UUID'),
  body('vehicleId').isUUID().withMessage('vehicleId is required and must be a valid UUID'),
  // Sprint 6: optional — a session without an assigned route behaves
  // exactly like a Sprint 5 session (no deviation/delay detection runs
  // for it), matching this project's established nullable-relation
  // backward-compatibility pattern (e.g. Detection.envelopeId).
  body('routeId').optional().isUUID().withMessage('routeId must be a valid UUID'),
  // Integration Sprint 2: both optional, both backward compatible —
  // omitting them behaves exactly as scenario: 'NORMAL', autoSimulate: true.
  body('scenario').optional().isIn(['NORMAL', 'WRONG_ROUTE', 'VEHICLE_STOP', 'BATTERY_LOW', 'LOST_GPS']).withMessage('Invalid scenario'),
  body('autoSimulate').optional().isBoolean().withMessage('autoSimulate must be a boolean'),
];

export const updateLocationValidator = [
  body('sessionId').isUUID().withMessage('sessionId is required and must be a valid UUID'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('latitude must be between -90 and 90'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('longitude must be between -180 and 180'),
  body('speed').optional().isFloat({ min: 0 }),
  body('accuracy').optional().isFloat({ min: 0 }),
  body('heading').optional().isFloat({ min: 0, max: 360 }),
  body('batteryLevel').optional().isInt({ min: 0, max: 100 }),
];

export const stopTransportValidator = [
  body('sessionId').isUUID().withMessage('sessionId is required and must be a valid UUID'),
];

export const pauseTransportValidator = [
  body('sessionId').isUUID().withMessage('sessionId is required and must be a valid UUID'),
];

export const resumeTransportValidator = [
  body('sessionId').isUUID().withMessage('sessionId is required and must be a valid UUID'),
];

export const sessionIdParamValidator = [
  param('sessionId').isUUID().withMessage('Invalid session id'),
];

export const envelopeIdParamValidator = [
  param('envelopeId').isUUID().withMessage('Invalid envelope id'),
];
