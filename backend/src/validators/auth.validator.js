import { body } from 'express-validator';

export const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  // CRITICAL fix (Final Verification Sprint security audit): role
  // removed entirely -- previously accepted as optional and validated
  // only against "is this a real role name", which let any
  // unauthenticated client self-register as ADMINISTRATOR. Real account
  // creation with a chosen role is POST /users (already correctly
  // gated to ADMINISTRATOR only); this is public self-registration and
  // must never be able to choose its own privilege level.
];

export const loginValidator = [
  body('email').isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

export const changePasswordValidator = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
];
