// Singleton Prisma client. Import { prisma } from this file everywhere
// instead of instantiating `new PrismaClient()` multiple times.
import { PrismaClient } from '@prisma/client';
import { isProduction } from './env.js';

export const prisma = new PrismaClient({
  log: isProduction ? ['error', 'warn'] : ['query', 'error', 'warn'],
});

// Graceful shutdown hook, invoked from server.js
export async function disconnectDb() {
  await prisma.$disconnect();
}
