// Global error handler. Must be registered LAST in app.js (after routes).
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/apiError.js';
import { logger } from '../config/logger.js';
import { isProduction } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details || null;

  // Prisma known request errors (e.g. unique constraint violations)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = `Duplicate value for field(s): ${err.meta?.target?.join(', ') || 'unknown'}`;
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Requested record was not found';
    } else if (err.code === 'P2003') {
      // Final Verification Sprint fix: previously fell into the generic
      // "Database request error" below. The most common real trigger is
      // deleting a record that other rows still reference (e.g. an
      // envelope with chain of custody history, which is every real
      // envelope from the moment it's created) -- a clear, specific
      // message instead of a generic one.
      statusCode = 409;
      message = `Cannot delete or modify this record -- other records still reference it (${err.meta?.field_name || 'a related field'}).`;
    } else {
      statusCode = 400;
      message = 'Database request error';
    }
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = 'Invalid data provided to the database layer';
  }

  if (!(err instanceof ApiError) && statusCode >= 500) {
    logger.error(err.stack || err.message);
  } else {
    logger.warn(`${statusCode} - ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    details,
    ...(isProduction ? {} : { stack: err.stack }),
  });
}
