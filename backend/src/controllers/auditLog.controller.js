import { auditLogService } from '../services/auditLog.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const listAuditLogs = asyncHandler(async (req, res) => {
  const result = await auditLogService.list(req.query);
  sendSuccess(res, { data: result });
});
