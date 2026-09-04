// Thin proxy to the AI service — per docs/chainguard-ai-technical-design-
// phase3a.md, Step 10: the frontend never calls the AI service directly,
// only the Node backend does, keeping one auth boundary.
import { aiClientService } from '../services/aiClient.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const getAiHealth = asyncHandler(async (req, res) => {
  const health = await aiClientService.checkHealth();
  sendSuccess(res, { data: health.data });
});

export const getAiModels = asyncHandler(async (req, res) => {
  const models = await aiClientService.listModels();
  sendSuccess(res, { data: models.data });
});
