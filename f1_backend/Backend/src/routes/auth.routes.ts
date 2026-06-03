import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { authRateLimit } from '../middleware/rateLimit.middleware';
import { UpdateMeSchema, SetRoleSchema } from '../schemas/zod/auth.schema';
import {
  getMe,
  syncUser,
  updateMe,
  setRole,
  listUsers,
} from '../controllers/auth.controller';

const router = Router();

// ── Public ───────────────────────────────────────────────────────────────────
// (No public endpoints: Firebase handles registration/login on the client side)

// ── Authenticated ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/sync
 * Idempotent upsert called immediately after Firebase login.
 * Creates the MongoDB user record on first call, no-ops thereafter.
 */
router.post('/sync', authRateLimit, requireAuth, syncUser);

/**
 * GET /api/auth/me
 * Returns the full user profile from MongoDB.
 */
router.get('/me', requireAuth, getMe);

/**
 * PATCH /api/auth/me
 * Update displayName, photoURL, or bio.
 */
router.patch('/me', requireAuth, validate(UpdateMeSchema), updateMe);

// ── Admin only ────────────────────────────────────────────────────────────────

/**
 * GET /api/auth/users
 * Paginated list of all platform users.
 */
router.get('/users', requireAuth, requireRole('admin'), listUsers);

/**
 * PATCH /api/auth/users/:id/role
 * Promote or demote a user's role.
 */
router.patch(
  '/users/:id/role',
  requireAuth,
  requireRole('admin'),
  validate(SetRoleSchema),
  setRole
);

export default router;
