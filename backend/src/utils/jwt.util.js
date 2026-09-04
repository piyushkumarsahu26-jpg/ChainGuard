// JWT sign/verify helpers for access and refresh tokens.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessExpiresIn, algorithm: 'HS256' });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn, algorithm: 'HS256' });
}

// Final Verification Sprint fix: explicitly pin the accepted algorithm
// rather than relying on jsonwebtoken's own default behavior. Not
// currently exploitable (jsonwebtoken@9.x already safely rejects `alg:
// none` and cross-algorithm confusion by default), but explicit
// algorithm whitelisting on verify is standard defense-in-depth and
// costs nothing.
export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, { algorithms: ['HS256'] });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret, { algorithms: ['HS256'] });
}
