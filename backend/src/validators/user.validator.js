import { body, param, query } from 'express-validator';
import { ALL_ROLES } from '../models/roles.model.js';

export const userIdParamValidator = [
  param('id').isUUID().withMessage('Invalid user id'),
];

export const createUserValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('role').isIn(ALL_ROLES).withMessage('Invalid role'),
  body('employeeId').optional().trim(),
  body('department').optional().trim(),
  body('designation').optional().trim(),
  body('phone').optional().trim(),
  body('assignedCenter').optional().trim(),
];

export const updateUserValidator = [
  param('id').isUUID().withMessage('Invalid user id'),
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('employeeId').optional().trim(),
  body('department').optional().trim(),
  body('designation').optional().trim(),
  body('phone').optional().trim(),
  body('assignedCenter').optional().trim(),
];

export const updateStatusValidator = [
  param('id').isUUID().withMessage('Invalid user id'),
  body('isActive').isBoolean().withMessage('isActive must be a boolean'),
];

export const updateRoleValidator = [
  param('id').isUUID().withMessage('Invalid user id'),
  body('role').isIn(ALL_ROLES).withMessage('Invalid role'),
];

export const resetPasswordValidator = [
  param('id').isUUID().withMessage('Invalid user id'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];

export const searchUsersValidator = [
  query('q').optional().trim(),
  query('role').optional().isIn(ALL_ROLES).withMessage('Invalid role'),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];
