import { Story } from '../models/Story.model';
import { AuditLog } from '../models/AuditLog.model';

export interface ListStoriesOptions {
  category?:     string;
  status?:       string;
  tag?:          string;
  search?:       string;
  sessionKey?:   string;
  scopeKind?:    'session' | 'driver' | 'team';
  driverNumber?: number;
  teamId?:       string;
  parentStoryId?: string;
  page?:         number;
  limit?:        number;
}

/**
 * Paginated list of stories. Defaults to published status.
 * Full content is excluded in list view for payload efficiency.
 */
export async function listStories(opts: ListStoriesOptions) {
  const {
    category, status, tag, search,
    sessionKey, scopeKind, driverNumber, teamId, parentStoryId,
    page = 1, limit = 10,
  } = opts;

  const filter: Record<string, unknown> = { status: status ?? 'published' };
  if (category)      filter.category   = category;
  if (tag)           filter.tags       = tag;
  if (search)        filter.$text      = { $search: search };
  if (sessionKey)    filter.sessionKey = sessionKey;
  if (scopeKind)     filter['scope.kind'] = scopeKind;
  if (driverNumber !== undefined) filter['scope.driverNumber'] = driverNumber;
  if (teamId)        filter['scope.teamId'] = teamId;
  if (parentStoryId) filter.parentStoryId = parentStoryId;

  const skip = (page - 1) * limit;
  const [stories, total] = await Promise.all([
    Story.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-content')   // omit full content blocks in list view
      .lean()
      .then(docs => docs.map(d => ({ ...d, id: String(d._id) }))),
    Story.countDocuments(filter),
  ]);

  return { stories, total, page, pages: Math.ceil(total / limit) };
}

/**
 * Single story with full content blocks. `content[].graphId` is returned as
 * a string ObjectId; the frontend resolves GraphSpec docs via /api/graphs/:id.
 * Excludes archived stories from public access.
 */
export async function getStoryBySlug(slug: string) {
  return Story.findOne({ slug, status: { $ne: 'archived' } });
}

export async function createStory(data: Record<string, unknown>) {
  return Story.create(data);
}

export async function updateStory(id: string, data: Record<string, unknown>) {
  const patch: Record<string, unknown> = { ...data };
  if (patch.status === 'published') {
    const existing = await Story.findById(id).select('publishedAt').lean();
    if (!existing?.publishedAt) {
      patch.publishedAt = new Date();
    }
  }
  return Story.findByIdAndUpdate(
    id,
    { $set: patch },
    { new: true, runValidators: true }
  );
}

/**
 * Transition a story to published status and write an audit log entry.
 */
export async function publishStory(id: string, actorId: string, ip: string) {
  const story = await Story.findByIdAndUpdate(
    id,
    { $set: { status: 'published', publishedAt: new Date() } },
    { new: true }
  );
  if (story) {
    await AuditLog.create({
      actorId,
      action:     'story.publish',
      resource:   'stories',
      resourceId: id,
      diff:       null,
      ip,
      userAgent:  '',
    });
  }
  return story;
}

/**
 * Soft-delete: set status to archived and write an audit log entry.
 */
export async function archiveStory(id: string, actorId: string, ip: string) {
  const story = await Story.findByIdAndUpdate(
    id,
    { $set: { status: 'archived' } },
    { new: true }
  );
  if (story) {
    await AuditLog.create({
      actorId,
      action:     'story.archive',
      resource:   'stories',
      resourceId: id,
      diff:       null,
      ip,
      userAgent:  '',
    });
  }
  return story;
}

/**
 * Hard-delete: permanently removes the story document from MongoDB.
 */
export async function permanentDeleteStory(id: string, actorId: string, ip: string) {
  const story = await Story.findOneAndDelete({ _id: id, status: 'archived' }).lean();
  if (story) {
    await AuditLog.create({
      actorId,
      action:     'story.permanentDelete',
      resource:   'stories',
      resourceId: id,
      diff:       null,
      ip,
      userAgent:  '',
    });
  }
  return story;
}
