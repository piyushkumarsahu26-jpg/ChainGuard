import { query } from 'express-validator';

// Final Verification Sprint fix: this route had zero validation --
// req.query.days went straight into Number() and then into a raw SQL
// parameter with no check that it was ever a real number. Not a SQL
// injection risk (analytics.service.js's $queryRaw is Prisma's tagged-
// template form, which auto-parameterizes), but a real, unhandled 500
// for any malformed value where a clean 400 belongs instead.
export const confidenceTrendValidator = [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('days must be an integer between 1 and 365'),
];
