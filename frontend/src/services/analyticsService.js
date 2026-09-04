// frontend/src/services/analyticsService.js
//
// Backend routes (analytics.routes.js) — all real aggregations over stored
// data. Charts backed by these will legitimately be empty until the AI
// service (Phase 3) is producing detections; callers should render an
// EmptyState in that case rather than treating an empty array as an error.

import api from "./api";

const analyticsService = {
  async getScansByMonth() {
    const response = await api.get("/analytics/scans-by-month");
    return response.data.data;
  },

  async getTamperBreakdown() {
    const response = await api.get("/analytics/tamper-breakdown");
    return response.data.data;
  },

  async getConfidenceTrend(days = 30) {
    const response = await api.get("/analytics/confidence-trend", { params: { days } });
    return response.data.data;
  },

  async getCenterRisk() {
    const response = await api.get("/analytics/center-risk");
    return response.data.data;
  },

  async getCameraStatus() {
    const response = await api.get("/analytics/camera-status");
    return response.data.data;
  },

  // QR Verification & Digital Authentication sprint (Phase 8)
  async getQrAnalytics() {
    const response = await api.get("/analytics/qr");
    return response.data.data;
  },
};

export default analyticsService;
