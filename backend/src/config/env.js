// Centralized environment variable access with sane defaults.
// Import this instead of reading process.env directly elsewhere.
import 'dotenv/config';

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Final Verification Sprint fix: cookie.secure previously defaulted to
// false unless COOKIE_SECURE=true was explicitly set -- an easy flag to
// forget in a real deployment, which would mean the refresh-token
// cookie is sent over plain HTTP with no warning. Now defaults safely
// based on NODE_ENV (secure automatically in production), with
// COOKIE_SECURE still available as an explicit override for edge cases
// (e.g. a staging environment served over HTTPS that isn't technically
// NODE_ENV=production). Extracted as a pure function (real inputs, not
// reading process.env itself) so this security-relevant decision has a
// real, direct test -- see tests/env.util.test.js.
export function resolveCookieSecure(nodeEnvValue, cookieSecureEnvValue) {
  if (cookieSecureEnvValue != null) return cookieSecureEnvValue === 'true';
  return (nodeEnvValue || 'development') === 'production';
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  databaseUrl: required('DATABASE_URL'),

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // QR Verification & Digital Authentication sprint. Deliberately NOT
  // required() with no fallback like the JWT secrets above -- this
  // variable didn't exist before this sprint, and any existing .env
  // file (this project's own, or a real deployment's) won't have it set
  // yet. Failing to boot over a missing new variable would itself be a
  // backward-compatibility break. Falls back to an insecure, clearly-
  // labeled dev value instead, with a startup warning so the gap is
  // visible rather than silent.
  qrSigningSecret: process.env.QR_SIGNING_SECRET || 'dev_only_insecure_qr_signing_secret_change_in_production',

  cookie: {
    secure: resolveCookieSecure(process.env.NODE_ENV, process.env.COOKIE_SECURE),
  },

  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.RATE_LIMIT_MAX || 300),
  },

  upload: {
    dir: process.env.UPLOAD_DIR || 'src/uploads',
    maxSizeMb: Number(process.env.MAX_UPLOAD_SIZE_MB || 10),
  },

  aiService: {
    url: process.env.AI_SERVICE_URL || 'http://localhost:8000',
    apiKey: process.env.AI_SERVICE_API_KEY || '',
    // Added in Sprint AI-4B — timeout/retry tuning for aiClient.service.js.
    // Defaults chosen for CPU inference on a small model (Sprint AI-3/4A's
    // real measurements: ~700-900ms/image) with headroom for a slower
    // production-scale model, not for a hung service to fail fast.
    timeoutMs: Number(process.env.AI_SERVICE_TIMEOUT_MS || 15000),
    maxRetries: Number(process.env.AI_SERVICE_MAX_RETRIES || 2),
  },
};

export const isProduction = env.nodeEnv === 'production';

// Plain console.warn, not the logger -- logger.js itself imports from
// this file, so importing it back here would be circular.
if (env.qrSigningSecret === 'dev_only_insecure_qr_signing_secret_change_in_production') {
  console.warn('[env] QR_SIGNING_SECRET is not set -- using an insecure development fallback. Set a real secret before any production deployment.');
}
