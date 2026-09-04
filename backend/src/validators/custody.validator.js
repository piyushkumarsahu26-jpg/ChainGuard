import { body, param, query } from 'express-validator';

export const scanQrValidator = [
  body('qrCode').trim().notEmpty().withMessage('qrCode is required'),
  body('location').trim().notEmpty().withMessage('location is required'),
  body('eventType')
    .optional()
    .isIn([
      'CREATED', 'QR_SCAN', 'HANDOVER', 'TRANSPORT_START', 'TRANSPORT_END',
      'RECEIVED_AT_CENTER', 'OPENED', 'SEAL_BROKEN', 'DISCREPANCY',
      'VERIFIED', 'HANDOVER_ACCEPTED', 'DAMAGED', 'TAMPERED', 'ARCHIVED',
    ]),
  body('remarks').optional().isString(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
];

export const trackingParamValidator = [param('envelopeId').isUUID().withMessage('Invalid envelope id')];

// Sprint 7 additions
export const qrCodeParamValidator = [param('qrCode').trim().notEmpty().withMessage('qrCode is required')];

// QR Verification & Digital Authentication sprint
export const verifyQrByContentValidator = [
  body('content').trim().notEmpty().withMessage('content is required'),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
  // Architectural Integration sprint (Phase 7 refinement) -- all
  // optional, matching latitude/longitude's own established pattern:
  // a caller that doesn't know its own state/city/centre/subject simply
  // omits it, and custody.service.js's checkAssignmentMismatch() skips
  // whichever specific comparisons it wasn't given input for.
  body('scanningState').optional().trim(),
  body('scanningCity').optional().trim(),
  body('scanningCentre').optional().trim(),
  body('scanningSubject').optional().trim(),
];

export const initiateHandoverValidator = [
  body('qrCode').trim().notEmpty().withMessage('qrCode is required'),
  body('toOfficerId').isUUID().withMessage('toOfficerId is required and must be a valid UUID'),
  body('location').trim().notEmpty().withMessage('location is required'),
  body('remarks').optional().isString(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
];

export const acceptHandoverValidator = [
  body('qrCode').trim().notEmpty().withMessage('qrCode is required'),
  body('location').trim().notEmpty().withMessage('location is required'),
  body('remarks').optional().isString(),
  body('latitude').optional().isFloat({ min: -90, max: 90 }),
  body('longitude').optional().isFloat({ min: -180, max: 180 }),
];

export const searchCustodyValidator = [
  query('officerId').optional().isUUID(),
  query('vehicleId').optional().isUUID(),
  query('envelopeCode').optional().isString(),
  query('qrCode').optional().isString(),
  query('center').optional().isString(),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601(),
];
