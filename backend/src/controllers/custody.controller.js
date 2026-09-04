import { custodyService } from '../services/custody.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

// QR Scan API — every scan creates a new custody event.
export const scanQr = asyncHandler(async (req, res) => {
  const result = await custodyService.scanQr({
    ...req.body,
    officerId: req.user.id,
    device: req.headers['user-agent'],
    ipAddress: req.ip,
  });
  sendSuccess(res, { statusCode: 201, data: result, message: 'Custody event recorded' });
});

// Sprint 7 (Part 2) — read-only QR verification, no custody event
// created. Kept as a GET with the content in the URL for backward
// compatibility with any existing caller using a legacy bare token
// (short enough to always fit safely in a URL); see verifyQrByContent
// below for the POST alternative a full signed JSON payload should use.
export const verifyQr = asyncHandler(async (req, res) => {
  const { lat, lng, state, city, centre, subject } = req.query;
  const result = await custodyService.verifyByQr(req.params.qrCode, {
    actorId: req.user.id,
    latitude: lat != null ? Number(lat) : undefined,
    longitude: lng != null ? Number(lng) : undefined,
    scanningState: state,
    scanningCity: city,
    scanningCentre: centre,
    scanningSubject: subject,
  });
  sendSuccess(res, { data: result });
});

// QR Verification & Digital Authentication sprint: the same
// verification this project's own signed QR payload actually needs --
// a POST with the scanned content in the body, not squeezed into a URL
// path segment. This is the endpoint the QR Verification page's
// scanner should call for anything the camera/upload reads that isn't
// a short legacy token.
export const verifyQrByContent = asyncHandler(async (req, res) => {
  const { content, latitude, longitude, scanningState, scanningCity, scanningCentre, scanningSubject } = req.body;
  const result = await custodyService.verifyByQr(content, {
    actorId: req.user.id,
    latitude,
    longitude,
    scanningState,
    scanningCity,
    scanningCentre,
    scanningSubject,
  });
  sendSuccess(res, { data: result });
});

// Sprint 7 (Part 4/5) — two-step handover.
export const initiateHandover = asyncHandler(async (req, res) => {
  const result = await custodyService.initiateHandover({
    ...req.body,
    fromOfficerId: req.user.id,
    device: req.headers['user-agent'],
  });
  sendSuccess(res, { statusCode: 201, data: result, message: 'Handover initiated — awaiting acceptance' });
});

export const acceptHandover = asyncHandler(async (req, res) => {
  const result = await custodyService.acceptHandover({
    ...req.body,
    officerId: req.user.id,
    device: req.headers['user-agent'],
  });
  sendSuccess(res, { data: result, message: 'Handover accepted' });
});

export const listPendingHandovers = asyncHandler(async (req, res) => {
  const pending = await custodyService.listPendingHandovers(req.user.id);
  sendSuccess(res, { data: pending });
});

// Sprint 7 (Part 7).
export const searchCustody = asyncHandler(async (req, res) => {
  const result = await custodyService.search(req.query);
  sendSuccess(res, { data: result });
});

// Tracking API — full chain-of-custody history for an envelope.
export const getTrackingHistory = asyncHandler(async (req, res) => {
  const history = await custodyService.getTrackingHistory(req.params.envelopeId);
  sendSuccess(res, { data: history });
});

export const listCustodyEvents = asyncHandler(async (req, res) => {
  const result = await custodyService.list(req.query);
  sendSuccess(res, { data: result });
});
