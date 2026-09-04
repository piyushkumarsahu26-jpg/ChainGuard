import { systemHealthService } from '../services/systemHealth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const getSystemHealth = asyncHandler(async (req, res) => {
  const health = await systemHealthService.getSystemHealth();
  sendSuccess(res, { data: health });
});

export const getAiHealth = asyncHandler(async (req, res) => {
  const health = await systemHealthService.getAiHealth();
  sendSuccess(res, { data: health });
});

export const getCameraHealth = asyncHandler(async (req, res) => {
  const health = await systemHealthService.getCameraHealth();
  sendSuccess(res, { data: health });
});
