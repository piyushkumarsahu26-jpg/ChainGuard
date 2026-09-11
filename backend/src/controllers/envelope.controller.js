import { envelopeService } from '../services/envelope.service.js';
import { riskScoreService } from '../services/riskScore.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';

export const createEnvelope = asyncHandler(async (req, res) => {
  const envelope = await envelopeService.create({ ...req.body, createdById: req.user.id });
  sendSuccess(res, { statusCode: 201, data: envelope, message: 'Envelope created' });
});

export const scanEnvelope = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('An image file is required (field name: "file")');

  const result = await envelopeService.scan({
    envelopeId: req.params.id,
    filePath: req.file.path,
    mimetype: req.file.mimetype,
    officerId: req.user.id,
    qrContent: req.body.qrContent,
  });
  sendSuccess(res, { data: result, message: `Scan complete: ${result.detections.length} finding(s)` });
});

export const getRiskScore = asyncHandler(async (req, res) => {
  const risk = await riskScoreService.computeForEnvelope(req.params.id);
  sendSuccess(res, { data: risk });
});

export const getEnvelope = asyncHandler(async (req, res) => {
  const envelope = await envelopeService.getById(req.params.id);
  sendSuccess(res, { data: envelope });
});

export const listEnvelopes = asyncHandler(async (req, res) => {
  const result = await envelopeService.list(req.query);
  sendSuccess(res, { data: result });
});

export const updateEnvelope = asyncHandler(async (req, res) => {
  const envelope = await envelopeService.update(req.params.id, req.body);
  sendSuccess(res, { data: envelope, message: 'Envelope updated' });
});

export const deleteEnvelope = asyncHandler(async (req, res) => {
  await envelopeService.remove(req.params.id);
  sendSuccess(res, { message: 'Envelope deleted' });
});

export const listCenters = asyncHandler(async (req, res) => {
  const centers = await envelopeService.listCenters();
  sendSuccess(res, { data: centers });
});
