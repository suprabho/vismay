import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as AuthService from '../services/auth.service';

/**
 * GET /api/auth/me
 * Returns the authenticated user's full profile from MongoDB.
 */
export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const user = await AuthService.getUserById(req.user!.id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json({
    id:          user._id,
    firebaseUid: user.firebaseUid,
    email:       user.email,
    displayName: user.displayName,
    role:        user.role,
    photoURL:    user.photoURL,
    bio:         user.bio,
    createdAt:   user.createdAt,
  });
});

/**
 * POST /api/auth/sync
 * Called by the frontend after Firebase login to ensure the user exists
 * in MongoDB. Safe to call on every app load — it's idempotent.
 */
export const syncUser = asyncHandler(async (req: Request, res: Response) => {
  const { firebaseUid, email, displayName, photoURL } = req.user!;
  const user = await AuthService.syncUser({ firebaseUid, email, displayName, photoURL: photoURL ?? null });
  res.status(200).json({
    id:          user._id,
    email:       user.email,
    displayName: user.displayName,
    role:        user.role,
    photoURL:    user.photoURL,
  });
});

/**
 * PATCH /api/auth/me
 * Update the current user's display name, photo, or bio.
 */
export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const { displayName, photoURL, bio } = req.body as {
    displayName?: string;
    photoURL?:    string | null;
    bio?:         string | null;
  };

  const updated = await AuthService.updateUser(req.user!.id, { displayName, photoURL, bio });
  if (!updated) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json({
    id:          updated._id,
    displayName: updated.displayName,
    photoURL:    updated.photoURL,
    bio:         updated.bio,
  });
});

/**
 * PATCH /api/auth/users/:id/role   [admin only]
 * Change another user's role.
 */
export const setRole = asyncHandler(async (req: Request, res: Response) => {
  const { role } = req.body as { role: 'viewer' | 'editor' | 'admin' };
  const updated  = await AuthService.setUserRole(
    req.params.id,
    role,
    req.user!.id,
    req.ip ?? ''
  );
  if (!updated) {
    res.status(404).json({ message: 'Target user not found' });
    return;
  }
  res.json({ id: updated._id, role: updated.role });
});

/**
 * GET /api/auth/users   [admin only]
 * Paginated list of all users.
 */
export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
  const limit = Math.min(100, parseInt(String(req.query.limit ?? '20'), 10));
  const result = await AuthService.listUsers(page, limit);
  res.json(result);
});
