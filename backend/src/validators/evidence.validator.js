import { body, param } from 'express-validator';

export const evidenceIdParamValidator = [param('id').isUUID().withMessage('Invalid evidence id')];

export const listEvidenceValidator = [
  // query params only, all optional — see evidence.service.js's list()
];

export const linkEvidenceValidator = [
  param('id').isUUID().withMessage('Invalid evidence id'),
  body('envelopeId').optional().isUUID(),
  body('alertId').optional().isUUID(),
];
