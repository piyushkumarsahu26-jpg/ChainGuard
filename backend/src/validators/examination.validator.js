import { body, param, query } from 'express-validator';

export const createExaminationValidator = [
  body('state').trim().notEmpty().withMessage('State is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('district').optional().trim(),
  body('centre').trim().notEmpty().withMessage('Centre is required'),
  body('examName').trim().notEmpty().withMessage('Exam name is required'),
  body('subject').optional().trim(),
  body('examDate').isISO8601().withMessage('A valid exam date is required'),
  body('examTime').trim().notEmpty().withMessage('Exam time is required'),
  body('session').optional().trim(),
  body('envelopeCount').optional().isInt({ min: 0 }).withMessage('envelopeCount must be a non-negative integer'),
  body('officerId').isUUID().withMessage('officerId is required and must be a valid UUID'),
];

export const updateExaminationValidator = [
  param('id').isUUID().withMessage('Invalid examination id'),
  body('state').optional().trim().notEmpty(),
  body('city').optional().trim().notEmpty(),
  body('district').optional().trim(),
  body('centre').optional().trim().notEmpty(),
  body('examName').optional().trim().notEmpty(),
  body('subject').optional().trim().notEmpty(),
  body('examDate').optional().isISO8601(),
  body('examTime').optional().trim().notEmpty(),
  body('session').optional().trim(),
  body('envelopeCount').optional().isInt({ min: 0 }),
  body('officerId').optional().isUUID(),
];

export const examinationIdParamValidator = [param('id').isUUID().withMessage('Invalid examination id')];

export const listExaminationValidator = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('centre').optional().trim(),
  query('state').optional().trim(),
];
