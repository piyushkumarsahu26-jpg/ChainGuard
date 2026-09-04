import { alertService } from '../services/alert.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const createAlert = asyncHandler(async (req, res) => {
  const alert = await alertService.create(req.body);
  sendSuccess(res, { statusCode: 201, data: alert, message: 'Alert created' });
});

export const getAlert = asyncHandler(async (req, res) => {
  const alert = await alertService.getById(req.params.id);
  sendSuccess(res, { data: alert });
});

export const listAlerts = asyncHandler(async (req, res) => {
  const result = await alertService.list(req.query);
  sendSuccess(res, { data: result });
});

export const updateAlert = asyncHandler(async (req, res) => {
  const alert = await alertService.update(req.params.id, req.body);
  sendSuccess(res, { data: alert, message: 'Alert updated' });
});

export const resolveAlert = asyncHandler(async (req, res) => {
  const alert = await alertService.resolve(req.params.id, req.user.id);
  sendSuccess(res, { data: alert, message: 'Alert resolved' });
});
