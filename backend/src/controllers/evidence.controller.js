import { evidenceService } from '../services/evidence.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const getEvidence = asyncHandler(async (req, res) => {
  const evidence = await evidenceService.getById(req.params.id);
  sendSuccess(res, { data: evidence });
});

export const listEvidence = asyncHandler(async (req, res) => {
  const result = await evidenceService.list(req.query);
  sendSuccess(res, { data: result });
});
