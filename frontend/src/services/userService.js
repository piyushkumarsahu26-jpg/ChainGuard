// frontend/src/services/userService.js
//
// Backend routes (user.routes.js):
//   GET    /api/v1/users/officers        -> lightweight roster, any authenticated role
//   GET    /api/v1/users/search          -> same query as getAll, dedicated path
//   GET    /api/v1/users                 -> full list (ADMINISTRATOR only)
//   POST   /api/v1/users                 -> create (ADMINISTRATOR only)
//   GET    /api/v1/users/:id             -> single user (ADMINISTRATOR only)
//   PUT    /api/v1/users/:id             -> update profile fields
//   PATCH  /api/v1/users/:id/status      -> activate/deactivate
//   PATCH  /api/v1/users/:id/role        -> change role
//   PATCH  /api/v1/users/:id/password-reset -> admin-triggered reset
//   PATCH  /api/v1/users/:id/restore     -> restore a soft-deleted user
//   DELETE /api/v1/users/:id             -> soft delete

import api from "./api";

const userService = {
  async getOfficers() {
    const response = await api.get("/users/officers");
    return response.data.data;
  },

  async getAll(params = {}) {
    const response = await api.get("/users", { params });
    return response.data.data;
  },

  async search(params = {}) {
    const response = await api.get("/users/search", { params });
    return response.data.data;
  },

  async getById(id) {
    const response = await api.get(`/users/${id}`);
    return response.data.data;
  },

  async create(payload) {
    const response = await api.post("/users", payload);
    return response.data.data;
  },

  async update(id, payload) {
    const response = await api.put(`/users/${id}`, payload);
    return response.data.data;
  },

  async updateStatus(id, isActive) {
    const response = await api.patch(`/users/${id}/status`, { isActive });
    return response.data.data;
  },

  async updateRole(id, role) {
    const response = await api.patch(`/users/${id}/role`, { role });
    return response.data.data;
  },

  async resetPassword(id, newPassword) {
    const response = await api.patch(`/users/${id}/password-reset`, { newPassword });
    return response.data;
  },

  async softDelete(id) {
    const response = await api.delete(`/users/${id}`);
    return response.data.data;
  },

  async restore(id) {
    const response = await api.patch(`/users/${id}/restore`);
    return response.data.data;
  },
};

export default userService;
