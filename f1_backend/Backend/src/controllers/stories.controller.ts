import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as StoriesService from '../services/stories.service';
import {
  CreateStoryInput,
  UpdateStoryInput,
  ListStoriesQueryInput,
} from '../schemas/zod/stories.schema';

/** GET /api/stories */
export const listStories = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListStoriesQueryInput;
  const result = await StoriesService.listStories({
    category:     query.category,
    status:       query.status,
    tag:          query.tag,
    search:       query.search,
    sessionKey:   query.sessionKey,
    scopeKind:    query.scopeKind,
    driverNumber: query.driverNumber,
    teamId:       query.teamId,
    parentStoryId: query.parentStoryId,
    page:         query.page,
    limit:        query.limit,
  });
  res.json(result);
});

/** GET /api/stories/:slug */
export const getStory = asyncHandler(async (req: Request, res: Response) => {
  const story = await StoriesService.getStoryBySlug(req.params.slug);
  if (!story) {
    res.status(404).json({ message: 'Story not found' });
    return;
  }
  res.json(story);
});

/** POST /api/stories */
export const createStory = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as CreateStoryInput;

  // Auto-generate slug from title if not supplied
  if (!data.slug) {
    data.slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  const story = await StoriesService.createStory(data as Record<string, unknown>);
  res.status(201).json(story);
});

/** PATCH /api/stories/:id */
export const updateStory = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as UpdateStoryInput;
  const story = await StoriesService.updateStory(req.params.id, data as Record<string, unknown>);
  if (!story) {
    res.status(404).json({ message: 'Story not found' });
    return;
  }
  res.json(story);
});

/** PATCH /api/stories/:id/publish */
export const publishStory = asyncHandler(async (req: Request, res: Response) => {
  const story = await StoriesService.publishStory(
    req.params.id,
    req.user!.id,
    req.ip ?? ''
  );
  if (!story) {
    res.status(404).json({ message: 'Story not found' });
    return;
  }
  res.json(story);
});

/** DELETE /api/stories/:id */
export const archiveStory = asyncHandler(async (req: Request, res: Response) => {
  const story = await StoriesService.archiveStory(
    req.params.id,
    req.user!.id,
    req.ip ?? ''
  );
  if (!story) {
    res.status(404).json({ message: 'Story not found' });
    return;
  }
  res.json({ message: 'Story archived' });
});

/** DELETE /api/stories/:id/permanent */
export const permanentDeleteStory = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await StoriesService.permanentDeleteStory(
    req.params.id,
    req.user!.id,
    req.ip ?? ''
  );
  if (!deleted) {
    res.status(404).json({ message: 'Story not found' });
    return;
  }
  res.json({ message: 'Story deleted' });
});
