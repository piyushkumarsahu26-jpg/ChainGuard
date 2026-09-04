// Wraps an async Express handler so rejected promises are forwarded to
// the global error handler instead of causing an unhandled rejection.
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
