// frontend/src/services/envelopeBatchService.js
import api from "./api";

const envelopeBatchService = {
  async generateBatch({ examinationId, count }) {
    const response = await api.post("/envelope-batches", { examinationId, count });
    return response.data.data;
  },

  async getById(id) {
    const response = await api.get(`/envelope-batches/${id}`);
    return response.data.data;
  },

  async listForExamination(examinationId) {
    const response = await api.get(`/envelope-batches/by-examination/${examinationId}`);
    return response.data.data;
  },

  // Real application/pdf download -- also marks QR_PRINTED server-side
  // on the first call (envelopeBatch.controller.js's getBatchPdf).
  async downloadPdf(id) {
    const response = await api.get(`/envelope-batches/${id}/pdf`, { responseType: "blob" });
    return response.data;
  },

  // The explicit operator confirmation this sprint's own correction
  // requires -- never called automatically as a side effect of printing.
  async confirmPreparation(id) {
    const response = await api.post(`/envelope-batches/${id}/confirm-preparation`);
    return response.data.data;
  },
};

export default envelopeBatchService;
