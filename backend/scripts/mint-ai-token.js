#!/usr/bin/env node
// Mints a long-lived AI_SYSTEM-role JWT for the AI service to authenticate
// to this backend (services/detection_client.py's Authorization header).
//
// Per the Phase 3A design document, Step 10: "minted once, out-of-band —
// not through the normal login flow, since the AI service isn't a human
// logging in." Uses jwt.sign() directly (not utils/jwt.util.js's
// signAccessToken(), which is hardcoded to the short 15m user-session
// expiry via env.jwt.accessExpiresIn) — a service credential needs a much
// longer lifetime, set explicitly here rather than by reusing a helper
// built for a different purpose.
//
// Usage: node scripts/mint-ai-token.js
// Paste the output into ai/.env's AI_SERVICE_JWT.
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';

const payload = {
  id: 'ai-system-service-account',
  role: 'AI_SYSTEM',
  email: 'ai-system@chainguard.local',
  name: 'ChainGuard AI Service',
};

const token = jwt.sign(payload, env.jwt.accessSecret, { expiresIn: '365d' });

console.log('AI_SYSTEM service token (expires in 365 days):');
console.log(token);
console.log('\nAdd this to ai/.env as:');
console.log(`AI_SERVICE_JWT=${token}`);
