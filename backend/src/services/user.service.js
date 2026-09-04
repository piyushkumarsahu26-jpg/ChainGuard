// Business logic for User administration: list/get/create/update, role and
// status management, soft delete/restore, admin-triggered password reset,
// and the officer roster used elsewhere in the app.
import { userRepository } from '../repositories/user.repository.js';
import { auditLogService } from './auditLog.service.js';
import { hashPassword } from '../utils/password.util.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';
import { ApiError } from '../utils/apiError.js';

function stripSensitive(user) {
  if (!user) return user;
  const { passwordHash, refreshToken, ...safe } = user;
  return safe;
}

export const userService = {
  // Powers both GET /users (list) and GET /users/search — same underlying
  // query, so there is exactly one place this logic lives. Soft-deleted
  // users are excluded unless the caller explicitly asks to include them
  // (e.g. an "Include deleted" toggle on the admin Users page).
  async list(query) {
    const { page, limit, skip } = getPagination(query);
    const where = {};

    if (query.role) where.role = query.role;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    if (query.department) where.department = query.department;
    if (query.center) where.assignedCenter = query.center;
    if (query.includeDeleted !== 'true') where.deletedAt = null;

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
        { employeeId: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const sortableFields = ['name', 'email', 'createdAt', 'lastLoginAt', 'role'];
    const sortBy = sortableFields.includes(query.sortBy) ? query.sortBy : 'createdAt';
    const sortDir = query.sortDir === 'asc' ? 'asc' : 'desc';

    const [items, total] = await Promise.all([
      userRepository.list({ skip, take: limit, where, orderBy: { [sortBy]: sortDir } }),
      userRepository.count(where),
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  async getById(id) {
    const user = await userRepository.findByIdWithProfile(id);
    if (!user) throw ApiError.notFound('User not found');
    return user;
  },

  async listOfficers() {
    return userRepository.officers();
  },

  async create(input, actorId, ipAddress) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) throw ApiError.conflict('A user with this email already exists');

    const passwordHash = await hashPassword(input.password);
    const user = await userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      employeeId: input.employeeId ?? null,
      department: input.department ?? null,
      designation: input.designation ?? null,
      phone: input.phone ?? null,
      assignedCenter: input.assignedCenter ?? null,
      createdById: actorId,
    });

    await auditLogService.record({
      action: 'USER_CREATED',
      actorId,
      targetUserId: user.id,
      ipAddress,
      metadata: { email: user.email, role: user.role },
    });

    return this.getById(user.id);
  },

  // Profile-field edits only — role, status, password, and deletion each
  // have their own dedicated method below. Keeping them separate means
  // every privilege-sensitive action has exactly one, auditable entry point,
  // instead of a single "update anything" endpoint that has to reimplement
  // the same escalation checks in a dozen different field combinations.
  async update(id, input, actorId, ipAddress) {
    await this.getById(id);
    const data = {};
    for (const field of ['name', 'employeeId', 'department', 'designation', 'phone', 'assignedCenter']) {
      if (input[field] !== undefined) data[field] = input[field];
    }

    const user = await userRepository.update(id, data);
    await auditLogService.record({
      action: 'USER_UPDATED',
      actorId,
      targetUserId: id,
      ipAddress,
      metadata: { fields: Object.keys(data) },
    });
    return stripSensitive(user);
  },

  async updateStatus(id, isActive, actorId, ipAddress) {
    if (id === actorId) {
      throw ApiError.forbidden('You cannot activate or deactivate your own account');
    }
    await this.getById(id);
    const user = await userRepository.update(id, { isActive });
    await auditLogService.record({
      action: isActive ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
      actorId,
      targetUserId: id,
      ipAddress,
    });
    return stripSensitive(user);
  },

  // Route-level RBAC (authorize(ROLES.ADMINISTRATOR)) already means only an
  // Administrator can reach this at all — no other role can call it with
  // any input. This additional self-check prevents a more subtle failure
  // mode: an Administrator accidentally demoting themselves out of the only
  // account able to manage roles, locking the whole admin module.
  async updateRole(id, role, actorId, ipAddress) {
    if (id === actorId) {
      throw ApiError.forbidden('You cannot change your own role');
    }
    const existing = await this.getById(id);
    const user = await userRepository.update(id, { role });
    await auditLogService.record({
      action: 'ROLE_CHANGED',
      actorId,
      targetUserId: id,
      ipAddress,
      metadata: { from: existing.role, to: role },
    });
    return stripSensitive(user);
  },

  // Admin-triggered reset: no current-password check (that's the point —
  // it's for when a user can't log in at all), but always audited under a
  // distinct action (PASSWORD_RESET) from self-service PASSWORD_CHANGED in
  // auth.service.js, so the two are never ambiguous in the audit trail.
  async resetPassword(id, newPassword, actorId, ipAddress) {
    await this.getById(id);
    const passwordHash = await hashPassword(newPassword);
    await userRepository.update(id, { passwordHash, refreshToken: null });
    await auditLogService.record({
      action: 'PASSWORD_RESET',
      actorId,
      targetUserId: id,
      ipAddress,
    });
  },

  async softDelete(id, actorId, ipAddress) {
    if (id === actorId) {
      throw ApiError.forbidden('You cannot delete your own account');
    }
    await this.getById(id);
    const user = await userRepository.update(id, { deletedAt: new Date(), refreshToken: null });
    await auditLogService.record({ action: 'USER_DELETED', actorId, targetUserId: id, ipAddress });
    return stripSensitive(user);
  },

  async restore(id, actorId, ipAddress) {
    const user = await userRepository.update(id, { deletedAt: null });
    await auditLogService.record({ action: 'USER_RESTORED', actorId, targetUserId: id, ipAddress });
    return stripSensitive(user);
  },
};
