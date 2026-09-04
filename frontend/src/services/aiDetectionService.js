// frontend/src/services/aiDetectionService.js
//
// Thin wrapper around the AI Detection REST endpoints, following the same
// pattern as cameraService.js / alertService.js — uses the shared axios
// instance (with baseURL, auth header, and refresh-token interceptor
// already configured in api.js).
//
// Backend routes (detection.routes.js):
//   GET /api/v1/detections      -> list (paginated, filterable)
//   GET /api/v1/detections/:id  -> single detection
//
// Note: POST /api/v1/detections is restricted to the AI_SYSTEM / ADMINISTRATOR
// roles (detection.routes.js) and is not called from this frontend client.

import api from "./api";

const aiDetectionService = {
  /**
   * Fetch a page of detections.
   * @param {Object} params
   * @param {number} [params.page]
   * @param {number} [params.limit]
   * @param {string} [params.cameraId]   - exact match, per detection.service.js
   * @param {string} [params.prediction] - partial, case-insensitive match
   * @returns {Promise<{items: Array, meta: Object}>}
   */
  async getAll(params = {}) {
    const response = await api.get("/detections", { params });
    return response.data.data;
  },

  /**
   * Fetch a single detection by id.
   * @param {string} id
   */
  async getById(id) {
    const response = await api.get(`/detections/${id}`);
    return response.data.data;
  },
};

export default aiDetectionService;