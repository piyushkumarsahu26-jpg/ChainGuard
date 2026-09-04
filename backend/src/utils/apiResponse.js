// Standard success response envelope so every endpoint returns the same shape.
export class ApiResponse {
  constructor(statusCode, data = null, message = 'Success') {
    this.success = statusCode < 400;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  send(res) {
    return res.status(this.statusCode).json(this);
  }
}

export function sendSuccess(res, { statusCode = 200, data = null, message = 'Success' } = {}) {
  return new ApiResponse(statusCode, data, message).send(res);
}
