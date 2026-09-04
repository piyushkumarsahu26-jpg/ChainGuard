import { dashboardService } from "../services/dashboard.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendSuccess } from "../utils/apiResponse.js";

export const getSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getSummary();

  sendSuccess(res, {
    data: summary,
  });
});

export const getActivity = asyncHandler(async (req, res) => {
  const activity = await dashboardService.getActivity();

  sendSuccess(res, {
    data: activity,
  });
});