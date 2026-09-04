// frontend/src/services/examinationService.js
import api from "./api";

const examinationService = {
  async create(data) {
    const response = await api.post("/examinations", data);
    return response.data.data;
  },

  async getAll(params = {}) {
    const response = await api.get("/examinations", { params });
    return response.data.data;
  },

  async getById(id) {
    const response = await api.get(`/examinations/${id}`);
    return response.data.data;
  },

  async update(id, data) {
    const response = await api.patch(`/examinations/${id}`, data);
    return response.data.data;
  },
};

export default examinationService;
