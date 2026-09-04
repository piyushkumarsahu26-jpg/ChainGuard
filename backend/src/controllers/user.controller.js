import { userService } from '../services/user.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.list(req.query);
  sendSuccess(res, { data: result });
});

// Same underlying query as listUsers — kept as a distinct route because the
// Phase 2 spec calls for a dedicated /users/search endpoint, but there is no
// second implementation of the search logic anywhere.
export const searchUsers = asyncHandler(async (req, res) => {
  const result = await userService.list(req.query);
  sendSuccess(res, { data: result });
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getById(req.params.id);
  sendSuccess(res, { data: user });
});

// Lightweight roster for dropdowns (Reports filters, etc.). Available to
// any authenticated role — unlike listUsers, it carries no sensitive fields.
export const listOfficers = asyncHandler(async (req, res) => {
  const officers = await userService.listOfficers();
  sendSuccess(res, { data: officers });
});

export const createUser = asyncHandler(async (req, res) => {
  const user = await userService.create(req.body, req.user.id, req.ip);
  sendSuccess(res, { statusCode: 201, data: user, message: 'User created successfully' });
});

export const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.update(req.params.id, req.body, req.user.id, req.ip);
  sendSuccess(res, { data: user, message: 'User updated successfully' });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const user = await userService.updateStatus(req.params.id, req.body.isActive, req.user.id, req.ip);
  sendSuccess(res, { data: user, message: 'User status updated' });
});

export const updateRole = asyncHandler(async (req, res) => {
  const user = await userService.updateRole(req.params.id, req.body.role, req.user.id, req.ip);
  sendSuccess(res, { data: user, message: 'User role updated' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await userService.resetPassword(req.params.id, req.body.newPassword, req.user.id, req.ip);
  sendSuccess(res, { message: 'Password reset successfully' });
});

export const softDeleteUser = asyncHandler(async (req, res) => {
  const user = await userService.softDelete(req.params.id, req.user.id, req.ip);
  sendSuccess(res, { data: user, message: 'User deleted (soft delete)' });
});

export const restoreUser = asyncHandler(async (req, res) => {
  const user = await userService.restore(req.params.id, req.user.id, req.ip);
  sendSuccess(res, { data: user, message: 'User restored' });
});
