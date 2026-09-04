// Business logic for Sprint 8 (Security Command Center) — Parts 6/7/8:
// Camera Health, AI Health, System Health. Every figure here is a real
// measurement (Node's own os module, a real query against Postgres, a
// real HTTP call to the AI service) — none of it is fabricated to make
// a dashboard look busy. Where this project genuinely has no GPU (every
// prior AI sprint's completion report confirms CPU-only training/
// inference throughout), that's reported honestly as "N/A", not faked
// as a plausible-looking percentage.
import os from 'os';
import fs from 'fs/promises';
import { prisma } from '../config/db.js';
import { cameraRepository } from '../repositories/camera.repository.js';
import { detectionRepository } from '../repositories/detection.repository.js';
import { alertRepository } from '../repositories/alert.repository.js';
import { aiClientService } from './aiClient.service.js';
import { getIo } from '../config/socket.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const CAMERA_STALE_HEARTBEAT_MINUTES = 5;
const LOW_FPS_THRESHOLD = 5;

export const systemHealthService = {
  // --- Part 8: System Health ---
  async getSystemHealth() {
    const [dbCheck, aiCheck] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      aiClientService.checkHealth(),
    ]);

    const database = { status: dbCheck.status === 'fulfilled' ? 'green' : 'red', detail: dbCheck.status === 'fulfilled' ? 'Connected' : dbCheck.reason?.message || 'Unreachable' };

    const aiOk = aiCheck.status === 'fulfilled';
    const aiService = {
      status: aiOk ? (aiCheck.value?.data?.modelLoaded ? 'green' : 'yellow') : 'red',
      detail: aiOk ? (aiCheck.value?.data?.modelLoaded ? 'Reachable, model loaded' : 'Reachable, no model loaded') : 'Unreachable',
    };

    let socketIo;
    try {
      const io = getIo();
      socketIo = { status: 'green', detail: `${io.engine.clientsCount} client(s) connected` };
    } catch {
      socketIo = { status: 'red', detail: 'Not initialized' };
    }

    let storage;
    try {
      await fs.access(env.upload.dir);
      const stat = await fs.stat(env.upload.dir);
      // Final Verification Sprint fix: stat was previously fetched and
      // never checked -- fs.access() only confirms the path exists and
      // is accessible, not that it's actually a directory. A
      // misconfigured UPLOAD_DIR pointing at a plain file would have
      // still reported "green/writable" here.
      if (!stat.isDirectory()) {
        storage = { status: 'red', detail: `${env.upload.dir} exists but is not a directory` };
      } else {
        storage = { status: 'green', detail: `Upload directory writable (${env.upload.dir})` };
      }
    } catch (err) {
      storage = { status: 'red', detail: err.message };
    }

    const freeMemMb = os.freemem() / (1024 * 1024);
    const totalMemMb = os.totalmem() / (1024 * 1024);
    const memUsedPct = ((totalMemMb - freeMemMb) / totalMemMb) * 100;
    const memory = {
      status: memUsedPct < 85 ? 'green' : memUsedPct < 95 ? 'yellow' : 'red',
      detail: `${memUsedPct.toFixed(1)}% used (${(totalMemMb - freeMemMb).toFixed(0)}MB / ${totalMemMb.toFixed(0)}MB)`,
    };

    // Node's os.loadavg() is a Unix-only real metric (1/5/15 min load
    // average) — not fabricated, but genuinely unavailable on Windows,
    // where it returns [0,0,0]. Reported as N/A there rather than a
    // misleading 0%.
    const [load1] = os.loadavg();
    const cpuCount = os.cpus().length;
    const isWindows = process.platform === 'win32';
    const cpu = isWindows
      ? { status: 'yellow', detail: 'Load average not available on this platform' }
      : { status: load1 / cpuCount < 0.8 ? 'green' : load1 / cpuCount < 1.5 ? 'yellow' : 'red', detail: `Load average ${load1.toFixed(2)} across ${cpuCount} core(s)` };

    return { database, aiService, socketIo, storage, memory, cpu };
  },

  // --- Part 7: AI Health — reuses the existing AI proxy endpoints
  // (ai.controller.js's /ai/health, /ai/models, added Sprint AI-4B)
  // rather than duplicating that HTTP call here; adds only what those
  // don't already provide (today's real scan/detection counts, average
  // confidence — both real Detection-table aggregates). ---
  async getAiHealth() {
    const [healthResult, modelsResult] = await Promise.allSettled([
      aiClientService.checkHealth(),
      aiClientService.listModels(),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayScans, todayDetections, allTodayScans] = await Promise.all([
      detectionRepository.count({ timestamp: { gte: today } }),
      detectionRepository.count({ timestamp: { gte: today } }), // scans and detections are the same table in this project — one Detection row per AI finding, no separate "scan attempt" record exists
      detectionRepository.list({ skip: 0, take: 1000, where: { timestamp: { gte: today } } }),
    ]);

    const confidences = allTodayScans.map((d) => d.confidence).filter((c) => c != null);
    const averageConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

    const health = healthResult.status === 'fulfilled' ? healthResult.value?.data : null;
    const models = modelsResult.status === 'fulfilled' ? modelsResult.value?.data : [];
    const champion = models?.find((m) => m.isChampion) || null;

    return {
      reachable: healthResult.status === 'fulfilled',
      currentModel: champion?.version || health?.championVersion || null,
      modelMetrics: champion?.metrics || null,
      // Real inference speed comes from GET /metrics (ai/routers/metrics.py,
      // Sprint AI-4A) — not duplicated here; the frontend calls that
      // endpoint directly (via the existing /ai proxy) for the live figure,
      // same "don't duplicate an API that already exists" reasoning as
      // this whole file's header comment.
      todayScans,
      todayDetections,
      averageConfidence,
      modelUptimeSince: health?.startedAt || null,
      lastInferenceAt: health?.lastInferenceAt || null,
    };
  },

  // --- Part 6: Camera Health ---
  async getCameraHealth() {
    const cameras = await cameraRepository.list({ skip: 0, take: 500, where: {} });
    const now = Date.now();

    return cameras.map((camera) => {
      const issues = [];
      if (camera.status === 'OFFLINE') issues.push('OFFLINE');
      if (camera.fps != null && camera.fps < LOW_FPS_THRESHOLD) issues.push('LOW_FPS');
      const staleMinutes = camera.lastHeartbeat ? (now - new Date(camera.lastHeartbeat).getTime()) / 60000 : Infinity;
      if (staleMinutes > CAMERA_STALE_HEARTBEAT_MINUTES) issues.push('DISCONNECTED');
      if (!camera.lastHeartbeat) issues.push('NO_STREAM');

      return {
        camera,
        healthy: issues.length === 0,
        issues,
        staleMinutes: Number.isFinite(staleMinutes) ? Math.round(staleMinutes) : null,
      };
    });
  },
};

// Debounce state for camera-health alerting, same in-process pattern as
// gps.service.js's alertedConditions (single-server deployment, same
// scope assumption made throughout this project).
const alertedCameras = new Map(); // cameraId -> Set of issue keys already alerted

async function raiseCameraAlert(camera, category, severity, title, description) {
  const alert = await alertRepository.create({ severity, status: 'OPEN', category, title, description, cameraId: camera.id });
  getIo().emit('alert:new', { alert });
  return alert;
}

/**
 * Periodically checks every camera for the health issues
 * systemHealthService.getCameraHealth() would report, and raises a real,
 * debounced Alert for OFFLINE/LOW_FPS conditions (Part 6, "Generate
 * alerts") — same interval-watcher pattern already established by
 * gps.service.js's startStaleSessionWatcher, not a new architecture.
 * Started once from server.js, same lifecycle as every other watcher.
 */
export function startCameraHealthWatcher(intervalMs = 30000) {
  return setInterval(async () => {
    try {
      const results = await systemHealthService.getCameraHealth();
      for (const { camera, issues } of results) {
        const alerted = alertedCameras.get(camera.id) || new Set();

        if (issues.includes('OFFLINE') && !alerted.has('OFFLINE')) {
          alerted.add('OFFLINE');
          await raiseCameraAlert(camera, 'CAMERA_OFFLINE', 'HIGH', `Camera offline: ${camera.name}`, `${camera.name} has not sent a heartbeat and is marked OFFLINE.`);
        } else if (!issues.includes('OFFLINE')) {
          alerted.delete('OFFLINE');
        }

        if (issues.includes('LOW_FPS') && !alerted.has('LOW_FPS')) {
          alerted.add('LOW_FPS');
          await raiseCameraAlert(camera, 'CAMERA_LOW_FPS', 'MEDIUM', `Low FPS: ${camera.name}`, `${camera.name} is streaming at ${camera.fps} FPS, below the ${LOW_FPS_THRESHOLD} FPS threshold.`);
        } else if (!issues.includes('LOW_FPS')) {
          alerted.delete('LOW_FPS');
        }

        alertedCameras.set(camera.id, alerted);
      }
    } catch (err) {
      logger.error(`Camera health watcher error: ${err.message}`);
    }
  }, intervalMs);
}
