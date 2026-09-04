// Business logic for authentication: register, login, refresh, logout.
import { userRepository } from '../repositories/user.repository.js';
import { tokenService } from './token.service.js';
import { auditLogService } from './auditLog.service.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.util.js';
import { hashPassword, comparePassword } from '../utils/password.util.js';
import { ApiError } from '../utils/apiError.js';
import { ROLES } from '../models/roles.model.js';

function buildTokenPayload(user) {
  return { id: user.id, role: user.role, email: user.email, name: user.name };
}

export const authService = {
  // CRITICAL fix (Final Verification Sprint security audit): role is no
  // longer accepted from self-registration input at all -- previously
  // destructured directly from the request body and passed straight
  // through to userRepository.create(), meaning any unauthenticated
  // client could self-register as ADMINISTRATOR (or any other role)
  // simply by including it in the request. Every self-registered
  // account is now unconditionally created as VIEWER (the lowest-
  // privilege role) regardless of what the request body contains; an
  // existing Administrator must deliberately elevate a user's role
  // afterward via the already-correctly-gated PATCH /users/:id/role.
  async register({ name, email, password }) {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw ApiError.conflict('A user with this email already exists');
    }
    const passwordHash = await hashPassword(password);
    const user = await userRepository.create({ name, email, passwordHash, role: ROLES.VIEWER });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  },

  async login({ email, password, ipAddress }) {
    const user = await userRepository.findByEmail(email);
    // Soft-deleted users are added in Phase 2 — a deleted account must not
    // be able to log in, same as an inactive one already couldn't.
    if (!user || !user.isActive || user.deletedAt) {
      await auditLogService.record({
        action: 'LOGIN_FAILED',
        actorId: user?.id ?? null,
        ipAddress,
        metadata: { email },
      });
      throw ApiError.unauthorized('Invalid credentials');
    }
    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      await auditLogService.record({
        action: 'LOGIN_FAILED',
        actorId: user.id,
        ipAddress,
        metadata: { email },
      });
      throw ApiError.unauthorized('Invalid credentials');
    }

    const payload = buildTokenPayload(user);
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken({ id: user.id });
    await tokenService.storeRefreshToken(user.id, refreshToken);
    await userRepository.updateLastLogin(user.id);
    await auditLogService.record({ action: 'LOGIN', actorId: user.id, ipAddress });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  },

  async refresh(refreshToken) {
    if (!refreshToken) throw ApiError.unauthorized('Refresh token missing');

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const user = await userRepository.findById(decoded.id);
    if (!user || !user.isActive || user.deletedAt) {
      throw ApiError.unauthorized('User not found or inactive');
    }

    const isValid = await tokenService.verifyStoredRefreshToken(user, refreshToken);
    if (!isValid) throw ApiError.unauthorized('Refresh token has been revoked');

    const payload = buildTokenPayload(user);
    const newAccessToken = signAccessToken(payload);
    const newRefreshToken = signRefreshToken({ id: user.id });
    await tokenService.storeRefreshToken(user.id, newRefreshToken);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  },

  async logout(userId, ipAddress) {
    await tokenService.clearRefreshToken(userId);
    await auditLogService.record({ action: 'LOGOUT', actorId: userId, ipAddress });
  },

  // Self-service password change (Settings page). Distinct from the
  // admin-triggered password-reset in user.service.js: this requires the
  // caller to prove they know their current password, and is logged as a
  // different audit action so the two can never be confused when reviewing
  // history.
  async changePassword(userId, { currentPassword, newPassword }, ipAddress) {
    const user = await userRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    const matches = await comparePassword(currentPassword, user.passwordHash);
    if (!matches) throw ApiError.unauthorized('Current password is incorrect');

    const passwordHash = await hashPassword(newPassword);
    await userRepository.update(userId, { passwordHash });
    await auditLogService.record({ action: 'PASSWORD_CHANGED', actorId: userId, ipAddress });
  },
};
