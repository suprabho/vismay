import { Router } from 'express';
import { requireAuth, requireAuthOrWorker, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  CreateSignalSchema,
  UpdateSignalSchema,
  BulkCreateSignalsSchema,
  ListSignalsQuerySchema,
} from '../schemas/zod/signals.schema';
import {
  listSignals,
  getSignal,
  createSignal,
  bulkCreateSignals,
  updateSignal,
  deactivateSignal,
} from '../controllers/signals.controller';

const router = Router();

// ── Public ────────────────────────────────────────────────────────────────────

/** GET /api/signals — active signals; filter by ?sessionKey=&priority=&lap= */
router.get('/', validate(ListSignalsQuerySchema, 'query'), listSignals);

/** GET /api/signals/:id — single signal */
router.get('/:id', getSignal);

// ── Editor / Admin ────────────────────────────────────────────────────────────

/** POST /api/signals — create a signal (user editor/admin or AI worker) */
router.post(
  '/',
  requireAuthOrWorker, requireRole('editor', 'admin'),
  validate(CreateSignalSchema),
  createSignal
);

/** POST /api/signals/bulk — insert many (AI worker); ?replaceExisting clears prior AI signals first */
router.post(
  '/bulk',
  requireAuthOrWorker, requireRole('editor', 'admin'),
  validate(BulkCreateSignalsSchema),
  bulkCreateSignals
);

/** PATCH /api/signals/:id — update signal fields */
router.patch(
  '/:id',
  requireAuth, requireRole('editor', 'admin'),
  validate(UpdateSignalSchema),
  updateSignal
);

/** DELETE /api/signals/:id — deactivate (isActive = false) */
router.delete('/:id', requireAuth, requireRole('admin'), deactivateSignal);

export default router;
