// frontend/src/services/gpsService.js
//
// Thin wrapper around the Sprint 5 GPS/vehicle REST endpoints, following
// the same pattern as every other *Service.js in this project.

import api from "./api";

const gpsService = {
  async startTransport({ envelopeId, officerId, vehicleId, routeId, scenario, autoSimulate }) {
    const response = await api.post("/gps/start", { envelopeId, officerId, vehicleId, routeId, scenario, autoSimulate });
    return response.data.data;
  },

  async pauseTransport(sessionId) {
    const response = await api.post("/gps/pause", { sessionId });
    return response.data.data;
  },

  // Integration Sprint 2: the simulation now runs server-side and
  // correctly stops sending updates while PAUSED, so nothing on the
  // frontend can implicitly "resume" it by simply sending another point
  // (that was the old client-driven design). This calls the new,
  // explicit POST /gps/resume instead.
  async resumeTransport(sessionId) {
    const response = await api.post("/gps/resume", { sessionId });
    return response.data.data;
  },

  async updateLocation(payload) {
    const response = await api.post("/gps/update", payload);
    return response.data.data;
  },

  async stopTransport(sessionId) {
    const response = await api.post("/gps/stop", { sessionId });
    return response.data.data;
  },

  async getLive() {
    const response = await api.get("/gps/live");
    return response.data.data;
  },

  async getHistory(sessionId) {
    const response = await api.get(`/gps/history/${sessionId}`);
    return response.data.data;
  },

  async getHistoryByEnvelope(envelopeId) {
    const response = await api.get(`/gps/history/by-envelope/${envelopeId}`);
    return response.data.data;
  },

  async getVehicles(params = {}) {
    const response = await api.get("/vehicles", { params });
    return response.data.data;
  },

  // Sprint 6 (Route Planning) — real, DB-backed routes, replacing
  // TransportMonitoring.jsx's Sprint 5 hardcoded PREDEFINED_ROUTES
  // constant as the data source (the UI itself — a route dropdown —
  // stays exactly the same).
  async listRoutes() {
    const response = await api.get("/routes");
    return response.data.data;
  },

  // Added for Transport Monitoring's demo auto-provisioning — calls the
  // existing, unmodified POST /routes endpoint (Sprint 6).
  async createRoute({ name, description, estimatedDurationMinutes, checkpoints }) {
    const response = await api.post("/routes", { name, description, estimatedDurationMinutes, checkpoints });
    return response.data.data;
  },

  async createVehicle({ vehicleNumber, driverName }) {
    const response = await api.post("/vehicles", { vehicleNumber, driverName });
    return response.data.data;
  },
};

export default gpsService;
