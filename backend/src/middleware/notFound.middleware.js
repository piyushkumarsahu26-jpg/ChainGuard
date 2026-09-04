// Catches any request that didn't match a defined route.
import { ApiError } from '../utils/apiError.js';

export function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
