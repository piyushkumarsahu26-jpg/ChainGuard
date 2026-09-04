// Data-access layer for User. No business logic here — only Prisma calls.
import { prisma } from '../config/db.js';

const listSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  employeeId: true,
  department: true,
  designation: true,
  phone: true,
  assignedCenter: true,
  lastLoginAt: true,
  profileImagePath: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
};

export const userRepository = {
  findByEmail: (email) => prisma.user.findUnique({ where: { email } }),
  findById: (id) => prisma.user.findUnique({ where: { id } }),
  findByIdWithProfile: (id) => prisma.user.findUnique({ where: { id }, select: listSelect }),
  create: (data) => prisma.user.create({ data }),
  updateRefreshToken: (id, refreshToken) =>
    prisma.user.update({ where: { id }, data: { refreshToken } }),
  update: (id, data) => prisma.user.update({ where: { id }, data }),
  updateLastLogin: (id) => prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } }),

  list: ({ skip, take, where, orderBy }) =>
    prisma.user.findMany({
      skip,
      take,
      where,
      orderBy: orderBy || { createdAt: 'desc' },
      select: listSelect,
    }),
  count: (where) => prisma.user.count({ where }),

  // Lightweight, non-sensitive projection used to populate officer-picker
  // dropdowns (Reports filters, future assignment UIs). Deliberately omits
  // email/isActive/createdAt — callers here don't need them and every field
  // returned is one more thing exposed to any authenticated role. Excludes
  // soft-deleted users, same as every other user-facing listing.
  officers: () =>
    prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
};
