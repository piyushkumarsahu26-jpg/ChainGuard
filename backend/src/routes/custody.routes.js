import { Router } from 'express';
import * as custodyController from '../controllers/custody.controller.js';
import {
  scanQrValidator, trackingParamValidator, qrCodeParamValidator, verifyQrByContentValidator,
  initiateHandoverValidator, acceptHandoverValidator, searchCustodyValidator,
} from '../validators/custody.validator.js';
import { validate } from '../middleware/validate.middleware.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { authorize } from '../middleware/rbac.middleware.js';
import { CUSTODY_ELIGIBLE_ROLES } from '../services/custody.service.js';

const router = Router();
router.use(authenticate);

// Final Verification Sprint: /scan, /verify (both forms), and
// /handover/* all perform a real, mutating action (a custody event, a
// qrVerifiedAt write, a possible transport auto-completion, or an
// actual custody transfer) -- none of these had role-level
// authorization before this fix, meaning a VIEWER or AUDITOR
// (explicitly documented as read-only roles in custody.service.js)
// could call any of them. /handover/pending, /search, /track, and the
// plain list route are genuinely read-only and remain open to any
// authenticated role, unchanged.
router.post('/scan', authorize(...CUSTODY_ELIGIBLE_ROLES), scanQrValidator, validate, custodyController.scanQr);

// Sprint 7 — read-only lookup by shape, but not by effect: this also
// writes qrVerifiedAt and a VERIFIED custody event (Phase 7 of the
// Architectural Integration sprint) and can auto-complete a transport
// session -- the "no custody event created" comment predates that and
// is now stale. Role-gated for the same reason as /scan above.
router.get('/verify/:qrCode', authorize(...CUSTODY_ELIGIBLE_ROLES), qrCodeParamValidator, validate, custodyController.verifyQr);

// QR Verification & Digital Authentication sprint — same verification,
// body-based for a full signed JSON payload rather than a URL segment.
router.post('/verify', authorize(...CUSTODY_ELIGIBLE_ROLES), verifyQrByContentValidator, validate, custodyController.verifyQrByContent);

// Sprint 7 — two-step handover workflow. /pending registered before any
// other GET routes below it that could otherwise be ambiguous.
router.post('/handover/initiate', authorize(...CUSTODY_ELIGIBLE_ROLES), initiateHandoverValidator, validate, custodyController.initiateHandover);
router.post('/handover/accept', authorize(...CUSTODY_ELIGIBLE_ROLES), acceptHandoverValidator, validate, custodyController.acceptHandover);
router.get('/handover/pending', custodyController.listPendingHandovers);

// Sprint 7 — search. Registered before '/' so it isn't shadowed by the
// plain list route below (both are GET, different paths, but keeping
// the more specific one first matches this project's established
// "register specific routes before param-like ones" convention).
router.get('/search', searchCustodyValidator, validate, custodyController.searchCustody);

// Tracking API — chain-of-custody history for a given envelope
router.get('/track/:envelopeId', trackingParamValidator, validate, custodyController.getTrackingHistory);

router.get('/', custodyController.listCustodyEvents);

export default router;
