import { examinationService } from '../services/examination.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';

export const createExamination = asyncHandler(async (req, res) => {
  const examination = await examinationService.create({ ...req.body, createdById: req.user.id });
  sendSuccess(res, { statusCode: 201, data: examination, message: 'Examination created' });
});

export const listExaminations = asyncHandler(async (req, res) => {
  const result = await examinationService.list(req.query);
  sendSuccess(res, { data: result });
});

export const getExamination = asyncHandler(async (req, res) => {
  const examination = await examinationService.getById(req.params.id);
  sendSuccess(res, { data: examination });
});

export const updateExamination = asyncHandler(async (req, res) => {
  const examination = await examinationService.update(req.params.id, req.body);
  sendSuccess(res, { data: examination });
});
