// Backend -> AI service HTTP client.
//
// Uses Node's native fetch/FormData (Node >=18, this project targets
// >=18.0.0, running 22.x) rather than adding axios as a new dependency —
// nothing else in this backend needed an HTTP client to an external
// service until now, so there was no existing convention to follow either
// way; native fetch is the lighter choice.
//
// Auth: a shared API key (X-API-Key header), matching env.aiService.apiKey
// — which has been scaffolded in .env.example since Phase 1, unused until
// now. This is deliberately simpler than the JWT scheme used for the
// reverse direction (AI service -> this backend's POST /api/v1/detections,
// which reuses the existing AI_SYSTEM-role JWT auth every other endpoint
// already uses) — a shared secret is adequate for one backend calling one
// trusted internal service, and doesn't require minting/rotating a token
// for a direction that was previously completely unauthenticated (see
// docs/chainguard-sprint-ai4a-completion-report.md's Known Issues).
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/apiError.js';

async function requestWithRetry(path, options, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.aiService.timeoutMs);

  try {
    const response = await fetch(`${env.aiService.url}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...options.headers,
        'X-API-Key': env.aiService.apiKey,
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw ApiError.serviceUnavailable(
        `AI service returned ${response.status}: ${body.message || response.statusText}`
      );
    }

    return response.json();
  } catch (err) {
    clearTimeout(timeout);

    const isTimeout = err.name === 'AbortError';
    // Node's fetch (built on undici) wraps every network-level failure —
    // connection refused, reset, socket closed mid-request, DNS failure,
    // etc. — as `TypeError: fetch failed` with the specific reason in
    // `err.cause.code` (e.g. ECONNREFUSED, UND_ERR_SOCKET, ENOTFOUND).
    // Checking only for ECONNREFUSED (this code's original version) missed
    // every other network failure mode — caught by this sprint's own test
    // suite deliberately simulating a mid-request connection drop, which
    // real deployments will also hit (a restarting AI service, a load
    // balancer resetting a connection, etc.), not just "nothing is
    // listening at all". Matching on the TypeError+message signature
    // instead of enumerating every possible `cause.code` individually.
    const isNetworkError = err.name === 'TypeError' && err.message === 'fetch failed';
    const isRetryable = isTimeout || isNetworkError;

    if (isRetryable && attempt < env.aiService.maxRetries) {
      const backoffMs = 250 * 2 ** attempt; // 250ms, 500ms, 1000ms...
      logger.warn(
        `AI service call to ${path} failed (attempt ${attempt + 1}/${env.aiService.maxRetries + 1}, ` +
        `${isTimeout ? 'timeout' : 'network error'}) — retrying in ${backoffMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return requestWithRetry(path, options, attempt + 1);
    }

    if (err instanceof ApiError) throw err;

    logger.error(`AI service call to ${path} failed permanently: ${err.message}`);
    throw ApiError.serviceUnavailable(
      isTimeout
        ? `AI service did not respond within ${env.aiService.timeoutMs}ms`
        : `Could not reach AI service: ${err.message}`
    );
  }
}

export const aiClientService = {
  async checkHealth() {
    return requestWithRetry('/health', { method: 'GET' });
  },

  async listModels() {
    return requestWithRetry('/models', { method: 'GET' });
  },

  /**
   * Submits an image buffer for prediction. `confidenceThreshold` is
   * optional — omit to use the AI service's own configured default.
   */
  async predictImage(buffer, filename, mimetype, { confidenceThreshold } = {}) {
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimetype }), filename);

    const query = confidenceThreshold !== undefined ? `?confidence_threshold=${confidenceThreshold}` : '';
    const result = await requestWithRetry(`/predict/image${query}`, { method: 'POST', body: form });
    return result.data;
  },
};
