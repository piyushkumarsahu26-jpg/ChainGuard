// frontend/src/services/systemService.js
//
// Wraps Sprint 8's new backend routes: system.routes.js (/system/*) and
// intelligence.routes.js (/intelligence/*). Follows the same thin-wrapper
// pattern as every other *Service.js file in this directory.
import api from "./api";

const systemService = {
  async getSystemHealth() {
    const response = await api.get("/system/health");
    return response.data.data;
  },

  async getAiHealth() {
    const response = await api.get("/system/ai-health");
    return response.data.data;
  },

  async getCameraHealth() {
    const response = await api.get("/system/camera-health");
    return response.data.data;
  },

  async getPredictions() {
    const response = await api.get("/intelligence/predictions");
    return response.data.data;
  },
};

export default systemService;
