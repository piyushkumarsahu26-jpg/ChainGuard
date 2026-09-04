import { asyncHandler } from '../utils/asyncHandler.js';
import { prisma } from '../config/db.js';

export const healthCheck = asyncHandler(async (req, res) => {
  let dbStatus = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = 'down';
  }

  res.status(dbStatus === 'up' ? 200 : 503).json({
    success: dbStatus === 'up',
    statusCode: dbStatus === 'up' ? 200 : 503,
    message: 'ChainGuard backend health check',
    data: {
      uptimeSeconds: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbStatus,
    },
  });
});
