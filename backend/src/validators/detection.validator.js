import { body, param } from 'express-validator';

export const createDetectionValidator = [
  body('cameraId').optional().isUUID().withMessage('cameraId must be a valid UUID'),
  body('envelopeId').optional().isUUID().withMessage('envelopeId must be a valid UUID'),
  body('prediction').trim().notEmpty().withMessage('Prediction label is required'),
  body('confidence').isFloat({ min: 0, max: 1 }).withMessage('Confidence must be between 0 and 1'),
  body('boundingBox').isObject().withMessage('boundingBox must be an object with x, y, width, height'),
  body('imagePath').optional().isString(),
  // A detection needs at least one piece of context — a camera (live/
  // prerecorded feed) or an envelope (manual scan). Neither present means
  // the detection can't be attributed to anything, which is a client
  // error, not a valid (if sparse) record.
  body().custom((value) => {
    if (!value.cameraId && !value.envelopeId) {
      throw new Error('At least one of cameraId or envelopeId is required');
    }
    return true;
  }),
];

export const detectionIdParamValidator = [param('id').isUUID().withMessage('Invalid detection id')];
