// Not in Sprint 5's literal "API" endpoint list — added because the
// frontend (vehicle picker for the GPS simulator, vehicle number display)
// has no other way to know which vehicles exist. Same category of small,
// clearly-flagged gap-fill as Phase 2's /users/:id/restore addition.
import { vehicleRepository } from '../repositories/vehicle.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.util.js';

export const listVehicles = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const where = {};
  if (req.query.status) where.status = req.query.status;

  const [items, total] = await Promise.all([
    vehicleRepository.list({ skip, take: limit, where }),
    vehicleRepository.count(where),
  ]);
  sendSuccess(res, { data: { items, meta: buildPaginationMeta({ page, limit, total }) } });
});

export const createVehicle = asyncHandler(async (req, res) => {
  const existing = await vehicleRepository.findByVehicleNumber(req.body.vehicleNumber);
  if (existing) throw ApiError.conflict('A vehicle with this number already exists');

  const vehicle = await vehicleRepository.create({
    vehicleNumber: req.body.vehicleNumber,
    driverName: req.body.driverName,
  });
  sendSuccess(res, { statusCode: 201, data: vehicle, message: 'Vehicle registered' });
});
