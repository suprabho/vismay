import { Router, Request, Response } from 'express';
import axios from 'axios';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/asyncHandler';
import { AuditLog } from '../models/AuditLog.model';
import { TelemetrySession } from '../models/TelemetrySession.model';
import { storyRunService } from '../services/storyRun.service';
import { RunStatus, RunPipeline, RunScope, RunStage } from '../models/StoryRun.model';
import { Story } from '../models/Story.model';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getSessionSummary } from '../controllers/telemetry.controller';

/**
 * Resolve the AI-worker endpoint from (pipeline, stage).
 *
 * The story crew pipelines run in two stages:
 *   1. 'angles'  → discover interesting angles per driver/team (admin reviews them)
 *   2. 'stories' → fan out one story per selected angle (+ session master story)
 *
 * 'langraph_telemetry' has no stage (telemetry + graphs/signals only).
 */
function resolveEndpoint(pipeline: RunPipeline, stage: RunStage): string {
  if (pipeline === 'langraph_telemetry') return '/run/telemetry-analysis';
  if (stage === 'stories')               return '/run/story-generation';
  // stage === 'angles'
  if (pipeline === 'full')               return '/run/telemetry-analysis'; // chains into angle discovery
  return '/run/angle-discovery';                                            // crew_story
}

const router = Router();

// All admin routes require authentication and admin role
router.use(requireAuth, requireRole('admin'));

// ── Story Runs ────────────────────────────────────────────────────────────────

/** GET /api/admin/runs — list AI pipeline runs */
router.get(
  '/runs',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await storyRunService.listRuns({
      status:   req.query.status   as RunStatus   | undefined,
      pipeline: req.query.pipeline as RunPipeline | undefined,
      page:     Number(req.query.page  ?? 1),
      limit:    Number(req.query.limit ?? 20),
    });
    res.json(result);
  })
);

/** GET /api/admin/runs/:id — single run detail + logs */
router.get(
  '/runs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const run = await storyRunService.getRun(req.params.id);
    if (!run) {
      res.status(404).json({ message: 'Run not found' });
      return;
    }
    res.json(run);
  })
);

/** DELETE /api/admin/runs/:id — delete a run */
router.delete(
  '/runs/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await storyRunService.deleteRun(req.params.id);
    if (!deleted) {
      res.status(404).json({ message: 'Run not found' });
      return;
    }
    res.status(200).json({ message: 'Run deleted successfully' });
  })
);

/** POST /api/admin/runs — trigger an AI pipeline run on an ingested session */
router.post(
  '/runs',
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionKey, pipeline, storyId, context, scopes, stage, angleId } = req.body as {
      sessionKey: string;
      pipeline:   RunPipeline;
      storyId?:   string;
      context?:   string;
      scopes?:    RunScope[];
      stage?:     RunStage;
      angleId?:   string;
    };

    const VALID_PIPELINES: RunPipeline[] = ['langraph_telemetry', 'crew_story', 'full'];
    if (!sessionKey || !pipeline) {
      res.status(400).json({ message: 'sessionKey and pipeline are required' });
      return;
    }
    if (!VALID_PIPELINES.includes(pipeline)) {
      res.status(400).json({ message: `Unknown pipeline: ${pipeline}` });
      return;
    }

    // Only the story-crew pipelines run in stages. 'langraph_telemetry' is stageless.
    // Default first stage for story pipelines is 'angles' (discovery before review).
    const runStage: RunStage | null =
      pipeline === 'langraph_telemetry' ? null : (stage === 'stories' ? 'stories' : 'angles');

    const ALLOWED_SCOPES: RunScope[] = ['session', 'driver', 'team'];
    const requestedScopes: RunScope[] = (Array.isArray(scopes) && scopes.length
      ? scopes.filter((s): s is RunScope => ALLOWED_SCOPES.includes(s))
      : ['session', 'driver', 'team']);
    if (!requestedScopes.includes('session')) {
      // Always include session scope so the session master story exists
      requestedScopes.unshift('session');
    }

    const session = await TelemetrySession.findOne({ sessionKey }).select('_id').lean();
    if (!session) {
      res.status(404).json({
        message: `Session ${sessionKey} not ingested. Ingest it first via /api/telemetry/ingest.`,
      });
      return;
    }

    const userId = (req as Request & { user?: { mongoId?: string } }).user?.mongoId;

    // Auto-create a draft Story if the caller didn't supply one.
    // This gives the AI worker a real document to PATCH into.
    let resolvedStoryId = storyId;
    if (!resolvedStoryId) {
      const slug = `${sessionKey}-${Date.now()}`;
      const draft = await Story.create({
        slug,
        status:      'draft',
        category:    'race-analysis',
        title:       `Analysis — ${sessionKey}`,
        summary:     '',
        coverImage:  { url: '', alt: '' },
        content:     [],
        sessionKey,
        scope:       { kind: 'session' },
        aiGenerated: true,
        authorId:    userId ? userId : null,
      });
      resolvedStoryId = (draft._id as unknown as { toString(): string }).toString();
      logger.info(`[admin] Auto-created draft story ${resolvedStoryId} for session ${sessionKey}`);
    }

    const run = await storyRunService.createRun({
      sessionKey,
      pipeline,
      stage: runStage ?? undefined,
      storyId: resolvedStoryId,
      triggeredBy: userId,
      scopesRequested: requestedScopes,
    });

    const runId = (run._id as unknown as { toString(): string }).toString();
    const endpoint = resolveEndpoint(pipeline, runStage ?? 'angles');

    // Fire-and-forget dispatch to AI Worker
    axios
      .post(
        `${env.AI_WORKER_URL}${endpoint}`,
        {
          session_key:  sessionKey,
          story_id:     resolvedStoryId,
          story_run_id: runId,
          context:      context ?? '',
          scopes:       requestedScopes,
          pipeline:     pipeline,
          stage:        runStage,
          angle_id:     angleId,
        },
        { headers: { 'X-Worker-Secret': env.AI_WORKER_SECRET }, timeout: 5_000 },
      )
      .catch((err: unknown) =>
        logger.warn('[admin] AI worker dispatch failed', {
          endpoint, runId, error: String(err),
        }),
      );

    logger.info(`[admin] Dispatched ${pipeline}/${runStage ?? 'none'} for ${sessionKey} (scopes=${requestedScopes.join(',')}) → runId ${runId}`);
    res.status(202).json(run);
  })
);

// ── Session Summary (admin ingestion health view) ─────────────────────────────

/** GET /api/admin/sessions/:sessionKey/summary — full ingestion-completeness dossier */
router.get('/sessions/:sessionKey/summary', getSessionSummary);

// ── Audit Logs ────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit
 * Paginated audit log. Filter by ?actorId=&resource=&page=&limit=
 */
router.get(
  '/audit',
  asyncHandler(async (req: Request, res: Response) => {
    const page  = Math.max(1, Number(req.query.page  ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const skip  = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (req.query.actorId)  filter.actorId  = req.query.actorId;
    if (req.query.resource) filter.resource = req.query.resource;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, pages: Math.ceil(total / limit) });
  })
);

export default router;
