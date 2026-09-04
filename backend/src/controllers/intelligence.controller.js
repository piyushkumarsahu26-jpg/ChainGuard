import { predictiveIntelligenceService } from '../services/predictiveIntelligence.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const getPredictions = asyncHandler(async (req, res) => {
  const predictions = await predictiveIntelligenceService.getPredictions();
  sendSuccess(res, { data: predictions });
});
