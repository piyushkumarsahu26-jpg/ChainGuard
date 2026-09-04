import { body, param } from 'express-validator';

export const generateBatchValidator = [
  body('examinationId').isUUID().withMessage('examinationId is required and must be a valid UUID'),
  body('count').isInt({ min: 1, max: 500 }).withMessage('count must be an integer between 1 and 500'),
];

export const batchIdParamValidator = [param('id').isUUID().withMessage('Invalid batch id')];

export const examinationIdParamValidator = [param('examinationId').isUUID().withMessage('Invalid examination id')];
