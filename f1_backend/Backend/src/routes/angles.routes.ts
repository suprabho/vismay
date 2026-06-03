import { Router } from 'express';
import { requireAuth, requireAuthOrWorker, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  CreateAnglesSchema,
  UpdateAngleSchema,
  BulkSelectSchema,
  ListAnglesQuerySchema,
} from '../schemas/zod/angles.schema';
import {
  listAngles,
  createAngles,
  updateAngle,
  bulkSelectAngles,
} from '../controllers/angles.controller';

const router = Router();

// All angle routes are admin/editor (or AI worker for create).
router.use(requireAuthOrWorker, requireRole('editor', 'admin'));

/** GET /api/analysis-angles — list angles; filter by ?sessionKey=&scopeKind=&status= */
router.get('/', validate(ListAnglesQuerySchema, 'query'), listAngles);

/** POST /api/analysis-angles — bulk create (AI worker or admin) */
router.post('/', validate(CreateAnglesSchema), createAngles);

/** POST /api/analysis-angles/bulk-select — set status on many angles */
router.post('/bulk-select', validate(BulkSelectSchema), bulkSelectAngles);

/** PATCH /api/analysis-angles/:id — edit / select / reject a single angle */
router.patch('/:id', validate(UpdateAngleSchema), updateAngle);

export default router;
