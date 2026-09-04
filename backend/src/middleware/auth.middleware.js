// Verifies the access token (Authorization: Bearer <token>) and attaches
// the decoded payload to req.user for downstream controllers/middleware.
import { verifyAccessToken } from '../utils/jwt.util.js';
import { ApiError } from '../utils/apiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or malformed Authorization header');
  }

  const token = header.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = payload; // { id, role, email }
    next();
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
});
