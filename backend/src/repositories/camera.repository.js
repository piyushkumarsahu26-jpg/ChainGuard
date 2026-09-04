// Data-access layer for Camera.
import { prisma } from '../config/db.js';

export const cameraRepository = {
  create: (data) => prisma.camera.create({ data }),
  findById: (id) => prisma.camera.findUnique({ where: { id } }),
  list: ({ skip, take, where }) =>
    prisma.camera.findMany({ skip, take, where, orderBy: { createdAt: 'desc' } }),
  count: (where) => prisma.camera.count({ where }),
  update: (id, data) => prisma.camera.update({ where: { id }, data }),
  delete: (id) => prisma.camera.delete({ where: { id } }),
  updateHeartbeat: (id, status) =>
    prisma.camera.update({ where: { id }, data: { status, lastHeartbeat: new Date() } }),
};
