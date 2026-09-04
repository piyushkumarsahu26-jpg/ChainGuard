// Role-based access control. Usage: authorize(ROLES.ADMINISTRATOR, ROLES.PRINTING_OFFICER)
import { ApiError } from '../utils/apiError.js';

export const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthorized('Authentication required'));
  }
  if (!allowedRoles.includes(req.user.role)) {
    return next(ApiError.forbidden('You do not have permission to perform this action'));
  }
  next();
};
