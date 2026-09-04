// Entry point: creates the HTTP server, attaches Socket.IO, and starts listening.
import http from 'http';
import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { initSockets } from './sockets/index.js';
import { disconnectDb } from './config/db.js';
import { startStaleSessionWatcher, stopAllAutoSimulations } from './services/gps.service.js';
import { startCameraHealthWatcher } from './services/systemHealth.service.js';

const httpServer = http.createServer(app);
initSockets(httpServer);

const server = httpServer.listen(env.port, () => {
  logger.info(`ChainGuard backend running on port ${env.port} [${env.nodeEnv}]`);
});

// Sprint 5 — checks active transport sessions for a stale GPS signal.
// Started after initSockets() since it broadcasts via getIo().
const gpsWatcherHandle = startStaleSessionWatcher();

// Sprint 8 — checks camera status/FPS/heartbeat staleness, same pattern.
const cameraWatcherHandle = startCameraHealthWatcher();

// --- Graceful shutdown ---
async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`);
  clearInterval(gpsWatcherHandle);
  clearInterval(cameraWatcherHandle);
  // Integration Sprint 2 — every session's own simulation interval, not
  // just the two fixed watchers above (there can be many, one per active
  // transport session).
  stopAllAutoSimulations();
  server.close(async () => {
    await disconnectDb();
    logger.info('Shutdown complete.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.stack || err.message}`);
  process.exit(1);
});
