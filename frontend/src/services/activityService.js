import api from "./api";

const activityService = {
  async getRecent() {
    const response = await api.get("/dashboard/activity");
    return response.data.data;
  },
};

export default activityService;