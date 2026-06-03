import { Request, Response, NextFunction } from 'express';
import { admin } from '../config/firebase';
import { User } from '../models/User.model';
import { logger } from '../utils/logger';
import { env } from '../config/env';

/**
 * Verifies the Firebase ID token sent in the Authorization header,
 * then resolves (or auto-provisions) the matching MongoDB User record.
 *
 * Attaches req.user for downstream controllers.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Missing or malformed Authorization header' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decoded = await admin.auth().verifyIdToken(idToken, /* checkRevoked */ true);

    // Look up existing user or auto-provision on first login
    let user = await User.findOne({ firebaseUid: decoded.uid });

    if (!user) {
      user = await User.create({
        firebaseUid:  decoded.uid,
        email:        decoded.email ?? '',
        displayName:  decoded.name ?? decoded.email?.split('@')[0] ?? 'Unknown',
        role:         'viewer',
        photoURL:     decoded.picture ?? null,
      });
      logger.info('Auto-provisioned new user', { uid: decoded.uid, email: user.email });
    }

    req.user = {
      id:          user._id.toString(),
      firebaseUid: decoded.uid,
      email:       user.email,
      displayName: user.displayName,
      role:        user.role,
      photoURL:    user.photoURL ?? null,
    };

    next();
  } catch (err) {
    logger.warn('Token verification failed', { err });
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Accepts either a Firebase Bearer token (user) or the X-Worker-Secret header (AI worker).
 * Grants the worker a synthetic editor identity so downstream requireRole gates pass.
 */
export async function requireAuthOrWorker(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const workerSecret = req.headers['x-worker-secret'];
  // Never authenticate on an empty/blank configured secret — that would let any
  // caller omit the header (or send "") and be treated as the AI worker.
  const configuredSecret = (env.AI_WORKER_SECRET ?? '').trim();
  if (
    configuredSecret.length > 0 &&
    typeof workerSecret === 'string' &&
    workerSecret === configuredSecret
  ) {
    req.user = {
      id:          'ai-worker',
      firebaseUid: 'ai-worker',
      email:       'worker@apex.internal',
      displayName: 'AI Worker',
      role:        'editor',
      photoURL:    null,
    };
    return next();
  }
  return requireAuth(req, res, next);
}

/**
 * Role guard — place after requireAuth.
 * Usage: router.delete('/:id', requireAuth, requireRole('admin'), handler)
 */
export function requireRole(...roles: Array<'viewer' | 'editor' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
