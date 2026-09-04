import { cameraService } from '../services/camera.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const createCamera = asyncHandler(async (req, res) => {
  const camera = await cameraService.create(req.body);
  sendSuccess(res, { statusCode: 201, data: camera, message: 'Camera registered' });
});

export const getCamera = asyncHandler(async (req, res) => {
  const camera = await cameraService.getById(req.params.id);
  sendSuccess(res, { data: camera });
});

export const listCameras = asyncHandler(async (req, res) => {
  const result = await cameraService.list(req.query);
  sendSuccess(res, { data: result });
});

export const updateCamera = asyncHandler(async (req, res) => {
  const camera = await cameraService.update(req.params.id, req.body);
  sendSuccess(res, { data: camera, message: 'Camera updated' });
});

export const deleteCamera = asyncHandler(async (req, res) => {
  await cameraService.remove(req.params.id);
  sendSuccess(res, { message: 'Camera deleted' });
});

export const heartbeat = asyncHandler(async (req, res) => {
  const camera = await cameraService.heartbeat(req.params.id, req.body.status);
  sendSuccess(res, { data: camera, message: 'Heartbeat recorded' });
});
