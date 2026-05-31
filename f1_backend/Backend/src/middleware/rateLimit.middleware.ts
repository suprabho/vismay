import rateLimit from 'express-rate-limit';

/**
 * Applied globally — relaxed ceiling to protect against abuse
 * without throttling normal usage.
 */
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max:      500,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many requests, please try again later' },
});

/**
 * Applied to auth mutation endpoints.
 */
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { message: 'Too many auth requests, slow down' },
});
