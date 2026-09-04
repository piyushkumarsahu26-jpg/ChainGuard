import api from "./api";

const authService = {
  login(email, password) {
    return api.post("/auth/login", {
      email,
      password,
    });
  },

  logout() {
    return api.post("/auth/logout");
  },

  refresh() {
    return api.post("/auth/refresh");
  },

  me() {
    return api.get("/auth/me");
  },

  changePassword(currentPassword, newPassword) {
    return api.patch("/auth/change-password", { currentPassword, newPassword });
  },
};

export default authService;