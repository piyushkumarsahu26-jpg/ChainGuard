// Socket.IO bootstrap: authentication middleware + connection wiring.
import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { logger } from '../config/logger.js';
import { setIo } from '../config/socket.js';
import { env } from '../config/env.js';
import { registerSocketEvents } from './events.js';

export function initSockets(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientUrl,
      credentials: true,
    },
  });

  // Simple JWT handshake auth: client passes access token in `auth.token`.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication token missing'));
      const payload = verifyAccessToken(token);
      socket.user = payload;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.user?.email || 'unknown'})`);
    registerSocketEvents(io, socket);

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  setIo(io);
  return io;
}
