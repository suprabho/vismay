import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';

import { connectDB } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';
import { errorMiddleware } from './middleware/error.middleware';
import { globalRateLimit } from './middleware/rateLimit.middleware';

import authRoutes     from './routes/auth.routes';
import storiesRoutes  from './routes/stories.routes';
import signalsRoutes  from './routes/signals.routes';
import telemetryRoutes from './routes/telemetry.routes';
import graphsRoutes   from './routes/graphs.routes';
import adminRoutes    from './routes/admin.routes';
import anglesRoutes   from './routes/angles.routes';

// ── App setup ─────────────────────────────────────────────────────────────────

const app = express();

// Security headers
app.use(helmet());

// gzip/deflate response bodies (large telemetry payloads compress ~8-10x)
app.use(compression());

// CORS — only allow the configured frontend origin
app.use(
  cors({
    origin:      env.FRONTEND_URL,
    credentials: true,
    methods:     ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing
app.use(express.json({ limit: '2mb' }));

// HTTP request logging (skip in test env)
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Global rate limiter
app.use(globalRateLimit);

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: env.NODE_ENV, ts: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────

app.use('/api/auth',      authRoutes);
app.use('/api/stories',   storiesRoutes);
app.use('/api/signals',   signalsRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/graphs',    graphsRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/analysis-angles', anglesRoutes);

// 404 handler — must come after all routes
app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// Global error handler — must be last
app.use(errorMiddleware);

// ── Start ─────────────────────────────────────────────────────────────────────

async function start() {
  await connectDB();
  app.listen(Number(env.PORT), () => {
    logger.info(`Backend running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: err });
  process.exit(1);
});

export default app;
