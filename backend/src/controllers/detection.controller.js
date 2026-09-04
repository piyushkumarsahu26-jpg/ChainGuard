import { detectionService } from '../services/detection.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

// Called by the AI System role (FastAPI service) when a prediction is made.
export const createDetection = asyncHandler(async (req, res) => {
  const result = await detectionService.create(req.body);
  sendSuccess(res, { statusCode: 201, data: result, message: 'Detection recorded' });
});

export const getDetection = asyncHandler(async (req, res) => {
  const detection = await detectionService.getById(req.params.id);
  sendSuccess(res, { data: detection });
});

export const listDetections = asyncHandler(async (req, res) => {
  const result = await detectionService.list(req.query);
  sendSuccess(res, { data: result });
});
