import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireAuthOrWorker, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  CreateStorySchema,
  UpdateStorySchema,
  ListStoriesQuerySchema,
} from '../schemas/zod/stories.schema';
import {
  listStories,
  getStory,
  createStory,
  updateStory,
  publishStory,
  archiveStory,
  permanentDeleteStory,
} from '../controllers/stories.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { Story } from '../models/Story.model';
import { storyRunService } from '../services/storyRun.service';
import { generateStoryDraft, generateStoryDraftOllama } from '../services/aiStory.service';
import { env } from '../config/env';
import axios from 'axios';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

/** GET /api/stories — paginated list; filter by ?category=&status=&tag=&search= */
router.get('/', validate(ListStoriesQuerySchema, 'query'), listStories);

/** GET /api/stories/:slug — single story with full content + embedded graph specs */
router.get('/:slug', getStory);

// ── Editor / Admin ────────────────────────────────────────────────────────────

/** POST /api/stories — create a draft story (user editor/admin or AI worker) */
router.post(
  '/',
  requireAuthOrWorker, requireRole('editor', 'admin'),
  validate(CreateStorySchema),
  createStory
);

/** PATCH /api/stories/:id — update story fields (user editor/admin or AI worker) */
router.patch(
  '/:id',
  requireAuthOrWorker, requireRole('editor', 'admin'),
  validate(UpdateStorySchema),
  updateStory
);

/** PATCH /api/stories/:id/publish — transition to published */
router.patch(
  '/:id/publish',
  requireAuth, requireRole('editor', 'admin'),
  (req: Request, res: Response, next: NextFunction) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: 'Invalid story id' });
      return;
    }
    next();
  },
  publishStory
);

/** DELETE /api/stories/:id/permanent — hard-delete (removes document) */
router.delete(
  '/:id/permanent',
  requireAuth, requireRole('admin'),
  (req: Request, res: Response, next: NextFunction) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      res.status(400).json({ message: 'Invalid story id' });
      return;
    }
    next();
  },
  permanentDeleteStory
);

/** DELETE /api/stories/:id — soft-delete (status = archived) */
router.delete('/:id', requireAuth, requireRole('admin'), archiveStory);

// ── AI generation (Phase 4) ───────────────────────────────────────────────────

const generateStoryHandler = asyncHandler(async (req: Request, res: Response) => {
    const story = await Story.findById(req.params.id).lean();
    if (!story) {
      res.status(404).json({ message: 'Story not found' });
      return;
    }

    const { sessionKey, context = '' } = req.body as { sessionKey?: string; context?: string };
    const effectiveSession = sessionKey ?? story.sessionKey ?? '';

    const run = await storyRunService.createRun({
      sessionKey: effectiveSession,
      pipeline:   effectiveSession ? 'full' : 'crew_story',
      storyId:    req.params.id,
      triggeredBy: req.user?.id,
    });

    const runId = (run._id as unknown as { toString(): string }).toString();

    let delegatedToWorker = false;
    if (env.AI_WORKER_URL && effectiveSession) {
      // Full pipeline via AI worker (LangGraph → CrewAI)
      try {
        await axios.post(`${env.AI_WORKER_URL}/run/telemetry-analysis`, {
          session_key:   effectiveSession,
          story_id:      req.params.id,
          story_run_id:  runId,
          context,
        }, { headers: { 'X-Worker-Secret': env.AI_WORKER_SECRET }, timeout: 5000 });
        delegatedToWorker = true;
      } catch {
        await storyRunService.appendLog(runId, 'AI worker unreachable — falling back to direct generation');
      }
    }

    // Fallback: generate directly via LLM if no session or worker unavailable
    if (!delegatedToWorker) {
      const runStatus = await storyRunService.getRun(runId);
      if (!runStatus || runStatus.status === 'queued') {
        await storyRunService.updateStatus(runId, 'running');
        try {
          let blocks;
          if (env.LLM_PROVIDER === 'ollama') {
            blocks = await generateStoryDraftOllama(story.title, context, story.category);
          } else {
            blocks = await generateStoryDraft(story.title, context, story.category);
          }
          await Story.findByIdAndUpdate(req.params.id, {
            $set: { content: blocks, aiGenerated: true },
          });
          await storyRunService.updateStatus(runId, 'done');
        } catch (err) {
          await storyRunService.updateStatus(runId, 'failed', String(err));
        }
      }
    }

    res.status(202).json({ runId, status: 'queued' });
});

/** POST /api/stories/:id/generate — dispatch story generation */
router.post(
  '/:id/generate',
  requireAuth, requireRole('editor', 'admin'),
  generateStoryHandler
);

/** POST /api/stories/:id/retry — explicitly retry story generation (alias to generate) */
router.post(
  '/:id/retry',
  requireAuth, requireRole('editor', 'admin'),
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Optionally clear existing content before retry
    await Story.findByIdAndUpdate(req.params.id, { $set: { content: [], aiGenerated: false } });
    next();
  }),
  generateStoryHandler
);

/** GET /api/stories/:id/run-status — poll job status */
router.get(
  '/:id/run-status',
  requireAuth, requireRole('editor', 'admin'),
  asyncHandler(async (req: Request, res: Response) => {
    const { StoryRun } = await import('../models/StoryRun.model');
    const run = await StoryRun.findOne({ storyId: req.params.id }).sort({ createdAt: -1 }).lean();
    if (!run) {
      res.status(404).json({ message: 'No run found for this story' });
      return;
    }
    res.json({
      runId: run._id,
      status: run.status,
      logs: run.logs ?? [],
      completedAt: run.completedAt,
    });
  })
);

export default router;
