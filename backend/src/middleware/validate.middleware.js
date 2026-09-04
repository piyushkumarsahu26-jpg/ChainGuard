// Runs after express-validator chains; collects and formats validation errors.
import { validationResult } from 'express-validator';
import { ApiError } from '../utils/apiError.js';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    return next(ApiError.badRequest('Validation failed', details));
  }
  next();
};
