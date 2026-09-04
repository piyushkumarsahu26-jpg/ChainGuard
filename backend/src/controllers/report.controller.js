import { reportService } from '../services/report.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const generateReport = asyncHandler(async (req, res) => {
  const report = await reportService.generate({ ...req.body, generatedById: req.user.id });
  sendSuccess(res, { statusCode: 201, data: report, message: 'Report generated' });
});

export const listReports = asyncHandler(async (req, res) => {
  const result = await reportService.list(req.query);
  sendSuccess(res, { data: result });
});

export const getReport = asyncHandler(async (req, res) => {
  const report = await reportService.getById(req.params.id);
  sendSuccess(res, { data: report });
});
