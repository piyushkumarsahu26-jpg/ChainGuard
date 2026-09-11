// frontend/src/services/envelopeService.js
//
// Thin wrapper around the Envelope REST endpoints, following the same
// pattern as cameraService.js / alertService.js.
//
// Backend routes (envelope.routes.js):
//   GET /api/v1/envelopes          -> list (paginated, filterable)
//   GET /api/v1/envelopes/centers  -> distinct exam centers
//   GET /api/v1/envelopes/:id      -> single envelope
//   POST /api/v1/envelopes/:id/scan -> on-demand AI scan (Sprint AI-4B Part 2)

import api from "./api";

const envelopeService = {
  async getAll(params = {}) {
    const response = await api.get("/envelopes", { params });
    return response.data.data;
  },

  async getById(id) {
    const response = await api.get(`/envelopes/${id}`);
    return response.data.data;
  },

  async getCenters() {
    const response = await api.get("/envelopes/centers");
    return response.data.data;
  },

  // Added for Transport Monitoring's demo auto-provisioning (see
  // TransportMonitoring.jsx's ensureDemoData()) — calls the existing,
  // unmodified POST /envelopes endpoint from Phase 1. Not new backend
  // capability, just a frontend wrapper that didn't exist yet.
  async create({ exam, subject, center }) {
    const response = await api.post("/envelopes", { exam, subject, center });
    return response.data.data;
  },

  // Sprint 8, Part 4 — wraps the new GET /envelopes/:id/risk-score.
  async getRiskScore(id) {
    const response = await api.get(`/envelopes/${id}/risk-score`);
    return response.data.data;
  },

  /**
   * Uploads an image for the on-demand AI scan flow. Multipart field name
   * is "file" — must match backend/src/routes/envelope.routes.js's
   * `upload.single('file')` exactly (the backend rejects any other field
   * name with a 400, per envelope.controller.js's scanEnvelope).
   *
   * `onUploadProgress` receives axios's native ProgressEvent (used for the
   * "Uploading… N%" state). `signal` is a standard AbortSignal — pass
   * `new AbortController().signal` to support cancellation.
   *
   * Response shape (from envelope.service.js's scan(), unchanged since
   * Sprint AI-4B Part 1 — this method does not alter the backend
   * contract, only calls it):
   *   { envelope, evidence, detections, alerts, aiProcessingTimeMs, modelVersion }
   */
  async scan(envelopeId, file, { onUploadProgress, signal } = {}) {
    const formData = new FormData();
    formData.append("file", file);

    const response = await api.post(`/envelopes/${envelopeId}/scan`, formData, {
      // The axios instance in api.js sets a default "Content-Type:
      // application/json" header. Overriding it to `undefined` here lets
      // the browser compute the correct "multipart/form-data;
      // boundary=..." header itself — setting it manually (or leaving
      // the JSON default in place) would send a malformed multipart body
      // that Multer can't parse.
      headers: { "Content-Type": undefined },
      onUploadProgress,
      signal,
    });
    return response.data.data;
  },
};

export default envelopeService;
