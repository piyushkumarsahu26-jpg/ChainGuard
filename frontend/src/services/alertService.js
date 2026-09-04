import api from "./api";

const alertService = {
  // Get all alerts
  async getAll(params = {}) {
    const response = await api.get("/alerts", { params });
    return response.data.data;
  },

  // Get a single alert
  async getById(id) {
    const response = await api.get(`/alerts/${id}`);
    return response.data.data;
  },

  // Resolve an alert
  async resolve(id) {
    const response = await api.post(`/alerts/${id}/resolve`);
    return response.data.data;
  },
};

export default alertService;