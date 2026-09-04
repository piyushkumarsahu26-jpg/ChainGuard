// Express application setup: middleware, routes, error handlers.
// Kept separate from server.js so tests can import `app` without
// binding to a real port or initializing Socket.IO.
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';

import { env } from './config/env.js';
import { morganStream } from './config/logger.js';
import apiRoutes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimiter.middleware.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFoundHandler } from './middleware/notFound.middleware.js';

const app = express();

// --- Security & core middleware ---
app.use(helmet());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev', { stream: morganStream }));
app.use(apiLimiter);

// Serve uploaded evidence/QR images statically (read-only).
app.use('/uploads', express.static(path.resolve(process.cwd(), env.upload.dir)));

// --- API routes ---
app.use('/api/v1', apiRoutes);

// --- Error handling (must be last) ---
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
