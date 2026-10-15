/** Errors that are safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Please sign in to continue.') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = "You don't have permission to do that.") => new AppError(403, 'forbidden', message);
/** Also used for resources in other workspaces so their existence is not revealed. */
export const notFound = (what = 'Resource') => new AppError(404, 'not_found', `${what} not found.`);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'conflict', message, details);
export const limitReached = (message: string, details?: unknown) => new AppError(402, 'limit_reached', message, details);
export const tooManyRequests = (retryAfterSec: number) =>
  new AppError(429, 'rate_limited', `Too many requests. Try again in ${retryAfterSec} seconds.`, { retryAfterSec });
export const validationError = (details: unknown, message = 'Some fields need attention.') =>
  new AppError(422, 'validation_error', message, details);
