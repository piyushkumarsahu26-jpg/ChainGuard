// frontend/src/services/custodyService.js
//
// Backend routes (custody.routes.js). Sprint 7 extended this file
// significantly — it previously had only getTrackingHistory.
import api from "./api";

const custodyService = {
  async getTrackingHistory(envelopeId) {
    const response = await api.get(`/custody/track/${envelopeId}`);
    return response.data.data;
  },

  async scanQr({ qrCode, location, remarks, eventType, latitude, longitude }) {
    const response = await api.post("/custody/scan", { qrCode, location, remarks, eventType, latitude, longitude });
    return response.data.data;
  },

  // Read-only lookup — does not create a custody event. Returns the
  // envelope plus its current GPS (if an active transport session
  // exists) and latest AI detection, per custody.service.js's
  // attachGpsAndAiStatus().
  async verifyByQr(qrCode) {
    const response = await api.get(`/custody/verify/${encodeURIComponent(qrCode)}`);
    return response.data.data;
  },

  // QR Verification & Digital Authentication sprint: the same
  // verification, via the new POST /custody/verify -- correct for a
  // full signed QR payload (arbitrary length, no URL-encoding concerns)
  // rather than squeezed into a URL path segment. Prefer this for
  // anything actually scanned by a camera/upload; verifyByQr above
  // remains for any caller specifically working with a short, known
  // token.
  async verifyByContent(content, { latitude, longitude, scanningState, scanningCity, scanningCentre, scanningSubject } = {}) {
    const response = await api.post("/custody/verify", { content, latitude, longitude, scanningState, scanningCity, scanningCentre, scanningSubject });
    return response.data.data;
  },

  async initiateHandover({ qrCode, toOfficerId, location, remarks, latitude, longitude }) {
    const response = await api.post("/custody/handover/initiate", { qrCode, toOfficerId, location, remarks, latitude, longitude });
    return response.data.data;
  },

  async acceptHandover({ qrCode, location, remarks, latitude, longitude }) {
    const response = await api.post("/custody/handover/accept", { qrCode, location, remarks, latitude, longitude });
    return response.data.data;
  },

  async listPendingHandovers() {
    const response = await api.get("/custody/handover/pending");
    return response.data.data;
  },

  async search(params = {}) {
    const response = await api.get("/custody/search", { params });
    return response.data.data;
  },
};

export default custodyService;
