import { User, IUser, UserRole } from '../models/User.model';
import { AuditLog } from '../models/AuditLog.model';

export interface SyncUserInput {
  firebaseUid:  string;
  email:        string;
  displayName:  string;
  photoURL:     string | null;
}

export interface UpdateMeInput {
  displayName?: string;
  photoURL?:    string | null;
  bio?:         string | null;
}

/**
 * Find a user by Firebase UID.
 */
export async function getUserByFirebaseUid(uid: string): Promise<IUser | null> {
  return User.findOne({ firebaseUid: uid });
}

/**
 * Find a user by MongoDB _id.
 */
export async function getUserById(id: string): Promise<IUser | null> {
  return User.findById(id);
}

/**
 * Upsert a user from their Firebase identity.
 * Called when a verified token has no local record yet (first-login).
 */
export async function syncUser(input: SyncUserInput): Promise<IUser> {
  const user = await User.findOneAndUpdate(
    { firebaseUid: input.firebaseUid },
    {
      $setOnInsert: { role: 'viewer' },
      $set: {
        email:       input.email,
        displayName: input.displayName,
        photoURL:    input.photoURL,
      },
    },
    { upsert: true, new: true, runValidators: true }
  );
  return user!;
}

/**
 * Update the authenticated user's own profile.
 */
export async function updateUser(id: string, data: UpdateMeInput): Promise<IUser | null> {
  return User.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true }
  );
}

/**
 * Set a user's role — admin only.
 * Writes an audit log entry.
 */
export async function setUserRole(
  targetId: string,
  newRole:  UserRole,
  actorId:  string,
  ip:       string
): Promise<IUser | null> {
  const previous = await User.findById(targetId);
  if (!previous) return null;

  const updated = await User.findByIdAndUpdate(
    targetId,
    { $set: { role: newRole } },
    { new: true }
  );

  await AuditLog.create({
    actorId:    actorId,
    action:     'user.role.change',
    resource:   'users',
    resourceId: targetId,
    diff:       { from: previous.role, to: newRole },
    ip,
  });

  return updated;
}

/**
 * Return all users — admin only, paginated.
 */
export async function listUsers(page: number, limit: number) {
  const skip  = (page - 1) * limit;
  const total = await User.countDocuments();
  const users = await User.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  return { users, total, page, pages: Math.ceil(total / limit) };
}
