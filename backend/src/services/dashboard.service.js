import { envelopeRepository } from "../repositories/envelope.repository.js";
import { cameraRepository } from "../repositories/camera.repository.js";
import { alertRepository } from "../repositories/alert.repository.js";
import { detectionRepository } from "../repositories/detection.repository.js";
import { gpsService } from "./gps.service.js";
import { aiClientService } from "./aiClient.service.js";
import { prisma } from "../config/db.js";

export const dashboardService = {
  async getSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalEnvelopes,
      activeCameras,
      openAlerts,
      todayScans,
      transport,
    ] = await Promise.all([
      envelopeRepository.count({}),
      cameraRepository.count({ status: "ONLINE" }),
      alertRepository.count({ status: "OPEN" }),
      detectionRepository.count({
        timestamp: {
          gte: today,
        },
      }),
      gpsService.getDashboardStats(),
    ]);

    // Sprint 8: replaces the hardcoded 99.1 placeholder with the real
    // champion model's actual mAP50, via the existing AI proxy client
    // (aiClient.service.js, Sprint AI-4B) -- no new HTTP call pattern,
    // reuses what was already there for the Envelope Scanner page.
    let aiAccuracy = null;
    try {
      const modelsResponse = await aiClientService.listModels();
      const champion = modelsResponse?.data?.find((m) => m.isChampion);
      aiAccuracy = champion ? Math.round(champion.metrics.mAP50 * 1000) / 10 : null;
    } catch {
      aiAccuracy = null; // AI service unreachable -- honestly null, not a stale fallback number
    }

    return {
      totalEnvelopes,
      activeCameras,
      tamperAlerts: openAlerts,
      todayScans,
      aiAccuracy, // Sprint 8: real champion-model mAP50 (as a 0-100 figure), or null if the AI service is unreachable
      transport,
    };
  },
  async getActivity() {
  const alerts = await prisma.alert.findMany({
    take: 10,
    orderBy: {
      createdAt: "desc",
    },
    include: {
      camera: {
        select: {
          name: true,
        },
      },
      envelope: {
        select: {
          envelopeCode: true,
        },
      },
    },
  });

  return alerts.map((alert) => ({
    id: alert.id,
    type: "ALERT",
    tag: "alert",
    text: `${alert.severity} alert on ${
      alert.envelope?.envelopeCode || "Unknown Envelope"
    }`,
    time: alert.createdAt,
    camera: alert.camera?.name || "Unknown Camera",
    status: alert.status,
  }));
 },
};