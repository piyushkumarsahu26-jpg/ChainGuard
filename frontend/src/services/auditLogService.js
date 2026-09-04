// frontend/src/services/auditLogService.js
//
// Backend route (auditLog.routes.js):
//   GET /api/v1/audit-logs  -> Administrator/Auditor only

import api from "./api";

const auditLogService = {
  async getAll(params = {}) {
    const response = await api.get("/audit-logs", { params });
    return response.data.data;
  },
};

export default auditLogService;
