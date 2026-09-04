import { Router } from "express";
import * as dashboardController from "../controllers/dashboard.controller.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.use(authenticate);

// Dashboard Summary
router.get("/summary", dashboardController.getSummary);

// Dashboard Recent Activity
router.get("/activity", dashboardController.getActivity);

export default router;