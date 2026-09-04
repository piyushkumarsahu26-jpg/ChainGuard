// frontend/src/services/reportService.js
//
// Backend routes (report.routes.js):
//   POST /api/v1/reports      -> generate (ADMINISTRATOR only)
//   GET  /api/v1/reports      -> list (paginated, filterable by type)
//   GET  /api/v1/reports/:id  -> a single report's real computed content (Sprint 8)

import api from "./api";

const reportService = {
  async generate({ title, type, filters }) {
    const response = await api.post("/reports", { title, type, filters });
    return response.data.data;
  },

  async getAll(params = {}) {
    const response = await api.get("/reports", { params });
    return response.data.data;
  },

  async getById(id) {
    const response = await api.get(`/reports/${id}`);
    return response.data.data;
  },
};

export default reportService;
