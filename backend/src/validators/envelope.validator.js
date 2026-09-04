import { body, param, query } from 'express-validator';

export const createEnvelopeValidator = [
  body('exam').trim().notEmpty().withMessage('Exam name is required'),
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('center').trim().notEmpty().withMessage('Center is required'),
];

export const updateEnvelopeValidator = [
  param('id').isUUID().withMessage('Invalid envelope id'),
  body('sealStatus').optional().isIn(['SEALED', 'BROKEN', 'TAMPERED', 'OPENED']),
  body('exam').optional().trim().notEmpty(),
  body('subject').optional().trim().notEmpty(),
  body('center').optional().trim().notEmpty(),
];

export const envelopeIdParamValidator = [param('id').isUUID().withMessage('Invalid envelope id')];

export const listEnvelopeValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('prepStatus').optional().isIn(['QR_GENERATED', 'QR_PRINTED', 'QR_ATTACHED', 'PACKED', 'SEALED', 'READY_FOR_DISPATCH']),
];
