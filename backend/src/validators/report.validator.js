import { body, param } from 'express-validator';

export const generateReportValidator = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('type').trim().notEmpty().withMessage('Report type is required'),
  body('filters').optional().isObject(),
];

export const reportIdParamValidator = [param('id').isUUID().withMessage('Invalid report id')];
