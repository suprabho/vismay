import { Router } from 'express';
import { requireAuth, requireAuthOrWorker, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { CreateGraphSchema, UpdateGraphSchema, BulkCreateGraphsSchema, ListGraphsQuerySchema } from '../schemas/zod/graphs.schema';
import { listGraphs, getGraph, createGraph, bulkCreateGraphs, updateGraph, deleteGraph } from '../controllers/graphs.controller';

const router = Router();

router.get('/', validate(ListGraphsQuerySchema, 'query'), listGraphs);
router.get('/:id', getGraph);

router.post(
  '/',
  requireAuthOrWorker, requireRole('editor', 'admin'),
  validate(CreateGraphSchema),
  createGraph,
);

/** POST /api/graphs/bulk — insert many (AI worker); ?replaceExisting clears prior AI graphs first */
router.post(
  '/bulk',
  requireAuthOrWorker, requireRole('editor', 'admin'),
  validate(BulkCreateGraphsSchema),
  bulkCreateGraphs,
);

router.patch(
  '/:id',
  requireAuth, requireRole('editor', 'admin'),
  validate(UpdateGraphSchema),
  updateGraph,
);

router.delete(
  '/:id',
  requireAuth, requireRole('admin'),
  deleteGraph,
);

export default router;
