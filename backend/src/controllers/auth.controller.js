// Controllers only orchestrate request/response + call services. No DB access here.
import { authService } from '../services/auth.service.js';
import { userService } from '../services/user.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { env } from '../config/env.js';

const REFRESH_COOKIE_NAME = 'chainguard_refresh_token';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.cookie.secure,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);
  sendSuccess(res, { statusCode: 201, data: user, message: 'User registered successfully' });
});

export const login = asyncHandler(async (req, res) => {
  const { accessToken, refreshToken, user } = await authService.login({ ...req.body, ipAddress: req.ip });
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { data: { accessToken, user }, message: 'Login successful' });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  const { accessToken, refreshToken } = await authService.refresh(token);
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { data: { accessToken }, message: 'Token refreshed' });
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.user.id, req.ip);
  res.clearCookie(REFRESH_COOKIE_NAME);
  sendSuccess(res, { message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req, res) => {
  // req.user is only the JWT payload ({id, role, email, name}) — Phase 2's
  // Settings page (Profile/Session Information) needs the full profile,
  // including fields the token doesn't carry (lastLoginAt, department,
  // employeeId, etc). Reusing userService here instead of duplicating a
  // query — same pattern as any other cross-module service call.
  const user = await userService.getById(req.user.id);
  sendSuccess(res, { data: user, message: 'Current user' });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body, req.ip);
  sendSuccess(res, { message: 'Password changed successfully' });
});
