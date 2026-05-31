import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import {
  listSessions,
  getSession,
  getSessionLaps,
  ingestSession,
  listAvailableSessions,
  getSessionStatus,
  retryEnrichment,
  retryPositions,
  listSessionPositions,
  getDriverPositions,
  getCircuit,
  getSessionAggregates,
  getSectorBests,
} from '../controllers/telemetry.controller';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

/** GET /api/telemetry/sessions/available?year= — Fast-F1 schedule for ingest UI (public catalog data) */
router.get('/sessions/available', listAvailableSessions);

/** GET /api/telemetry/sessions — list ingested sessions */
router.get('/sessions', listSessions);

/** GET /api/telemetry/sessions/:sessionKey/status — lightweight enrichment status poll */
router.get('/sessions/:sessionKey/status', getSessionStatus);

/** GET /api/telemetry/sessions/:sessionKey — session detail + drivers */
router.get('/sessions/:sessionKey', getSession);

/** GET /api/telemetry/sessions/:sessionKey/laps — processed lap data */
router.get('/sessions/:sessionKey/laps', getSessionLaps);

/** GET /api/telemetry/sessions/:sessionKey/positions — list drivers with position frames */
router.get('/sessions/:sessionKey/positions', listSessionPositions);

/** GET /api/telemetry/sessions/:sessionKey/positions/:driverNumber — full driver position track (?lapFrom=&lapTo=) */
router.get('/sessions/:sessionKey/positions/:driverNumber', getDriverPositions);

/** GET /api/telemetry/sessions/:sessionKey/aggregates?driver= — per-lap telemetry aggregates */
router.get('/sessions/:sessionKey/aggregates', getSessionAggregates);

/** GET /api/telemetry/sessions/:sessionKey/sector-bests — per-driver + session purple sector bests */
router.get('/sessions/:sessionKey/sector-bests', getSectorBests);

/** GET /api/telemetry/circuits/:circuitKey?year= — circuit geometry (corners + outline) */
router.get('/circuits/:circuitKey', getCircuit);

// ── Admin — ingest triggers ───────────────────────────────────────────────────

/**
 * POST /api/telemetry/ingest
 * Triggers Fast-F1 ingestion via AI Worker.
 * Body: { year, gpName, sessionType }
 */
router.post('/ingest', requireAuth, requireRole('admin'), ingestSession);

/** POST /api/telemetry/sessions/:sessionKey/retry — re-run Phase 2 telemetry enrichment */
router.post('/sessions/:sessionKey/retry', requireAuth, requireRole('admin'), retryEnrichment);

/** POST /api/telemetry/sessions/:sessionKey/retry-positions — re-run Phase 3 position enrichment */
router.post('/sessions/:sessionKey/retry-positions', requireAuth, requireRole('admin'), retryPositions);

export default router;
