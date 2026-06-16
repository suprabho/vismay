import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface AppError extends Error {
  statusCode?: number;
  code?:       number | string;
}

export function errorMiddleware(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Mongoose duplicate key
  const statusCode = err.statusCode ?? (err.code === 11000 ? 409 : 500);
  const message =
    err.code === 11000
      ? 'A record with that value already exists'
      : err.message ?? 'Internal server error';

  logger.error('Unhandled error', {
    path:    req.path,
    method:  req.method,
    message: err.message,
    stack:   env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    message,
    ...(env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}
