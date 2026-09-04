// frontend/src/services/cameraService.js
import api from "./api";

const cameraService = {
  async getAll(params = {}) {
    const response = await api.get("/cameras", { params });
    return response.data.data;
  },

  async update(id, data) {
    const response = await api.patch(`/cameras/${id}`, data);
    return response.data.data;
  },

  // Reuses the existing heartbeat endpoint (ADMINISTRATOR/AI_SYSTEM-gated)
  // as the mechanism for a manual "restart" action — there is no separate
  // restart endpoint, and heartbeat already does exactly what's needed:
  // records a status + timestamp for the camera.
  async heartbeat(id, status) {
    const response = await api.post(`/cameras/${id}/heartbeat`, { status });
    return response.data.data;
  },
};

export default cameraService;