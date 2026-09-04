import { analyticsService } from '../services/analytics.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const getScansByMonth = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await analyticsService.getScansByMonth() });
});

export const getTamperBreakdown = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await analyticsService.getTamperBreakdown() });
});

export const getConfidenceTrend = asyncHandler(async (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 30;
  sendSuccess(res, { data: await analyticsService.getConfidenceTrend(days) });
});

export const getCenterRisk = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await analyticsService.getCenterRisk() });
});

export const getCameraStatus = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await analyticsService.getCameraStatus() });
});

export const getQrAnalytics = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await analyticsService.getQrAnalytics() });
});
