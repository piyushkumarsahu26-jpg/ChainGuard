// Sprint 6 (Route Planning): "Store routes in PostgreSQL." Not in Sprint
// 5's original API list — a new resource this sprint genuinely needs, so
// it gets its own controller/routes/validator, mirroring
// vehicle.controller.js's pattern (direct repository access, no separate
// service.js — simple CRUD doesn't need one, same precedent).
import { transportRouteRepository, routeCheckpointRepository } from '../repositories/transportRoute.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { ApiError } from '../utils/apiError.js';

export const listRoutes = asyncHandler(async (req, res) => {
  const routes = await transportRouteRepository.list();
  sendSuccess(res, { data: routes });
});

export const getRoute = asyncHandler(async (req, res) => {
  const route = await transportRouteRepository.findById(req.params.id);
  if (!route) throw ApiError.notFound('Route not found');
  sendSuccess(res, { data: route });
});

export const createRoute = asyncHandler(async (req, res) => {
  const { name, description, estimatedDurationMinutes, checkpoints } = req.body;

  const route = await transportRouteRepository.create({
    name,
    description: description || null,
    estimatedDurationMinutes: estimatedDurationMinutes || 45,
  });
  await routeCheckpointRepository.createMany(route.id, checkpoints);

  const withCheckpoints = await transportRouteRepository.findById(route.id);
  sendSuccess(res, { statusCode: 201, data: withCheckpoints, message: 'Route created' });
});
