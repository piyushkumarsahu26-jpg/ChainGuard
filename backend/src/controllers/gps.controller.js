import { gpsService } from '../services/gps.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const startTransport = asyncHandler(async (req, res) => {
  const session = await gpsService.startTransport(req.body);
  sendSuccess(res, { statusCode: 201, data: session, message: 'Transport session started' });
});

export const pauseTransport = asyncHandler(async (req, res) => {
  const session = await gpsService.pauseTransport(req.body);
  sendSuccess(res, { data: session, message: 'Transport session paused' });
});

export const resumeTransport = asyncHandler(async (req, res) => {
  const session = await gpsService.resumeTransport(req.body);
  sendSuccess(res, { data: session, message: 'Transport session resumed' });
});

export const updateLocation = asyncHandler(async (req, res) => {
  const result = await gpsService.updateLocation(req.body);
  sendSuccess(res, { data: result, message: 'Location recorded' });
});

export const stopTransport = asyncHandler(async (req, res) => {
  const session = await gpsService.stopTransport(req.body);
  sendSuccess(res, { data: session, message: 'Transport session completed' });
});

export const getLive = asyncHandler(async (req, res) => {
  const live = await gpsService.getLiveLocations();
  sendSuccess(res, { data: live });
});

export const getHistory = asyncHandler(async (req, res) => {
  const history = await gpsService.getHistory(req.params.sessionId);
  sendSuccess(res, { data: history });
});

export const getHistoryByEnvelope = asyncHandler(async (req, res) => {
  const history = await gpsService.getHistoryByEnvelope(req.params.envelopeId);
  sendSuccess(res, { data: history });
});
