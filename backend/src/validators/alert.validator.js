import { body, param } from 'express-validator';

export const createAlertValidator = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  body('cameraId').optional().isUUID(),
  body('envelopeId').optional().isUUID(),
  body('detectionId').optional().isUUID(),
];

export const updateAlertValidator = [
  param('id').isUUID().withMessage('Invalid alert id'),
  body('status').optional().isIn(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']),
  body('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
];

export const alertIdParamValidator = [param('id').isUUID().withMessage('Invalid alert id')];
