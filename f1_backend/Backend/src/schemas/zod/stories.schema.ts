import { z } from 'zod';

const ContentBlockSchema = z.object({
  type:    z.enum(['paragraph', 'heading', 'quote', 'stat', 'graph_embed']),
  text:    z.string().optional(),
  graphId: z.string().optional(),
  meta:    z.record(z.unknown()).optional(),
});

const StoryScopeSchema = z.object({
  kind:         z.enum(['session', 'driver', 'team']).default('session'),
  driverNumber: z.number().int().positive().nullable().optional(),
  teamId:       z.string().nullable().optional(),
  teamName:     z.string().nullable().optional(),
});

export const CreateStorySchema = z.object({
  slug:        z.string().min(1).max(200).toLowerCase().optional(),
  category:    z.string().min(1).max(80),
  title:       z.string().min(1).max(200),
  summary:     z.string().max(500).default(''),
  coverImage:  z.object({
    url: z.string(),
    alt: z.string(),
  }).default({ url: '/cover-default.jpg', alt: 'Story cover' }),
  content:     z.array(ContentBlockSchema).default([]),
  readTimeMin: z.number().int().positive().default(5),
  tags:        z.array(z.string().trim()).default([]),
  sessionKey:  z.string().nullable().default(null),
  scope:       StoryScopeSchema.default({ kind: 'session' }),
  parentStoryId: z.string().nullable().optional(),
  analysisAngleId: z.string().nullable().optional(),
  status:      z.enum(['draft', 'published', 'archived']).default('draft'),
  aiGenerated: z.boolean().default(false),
  // Review metadata written by the AI worker's verifier + angle-coherence
  // judge. Optional so non-AI authoring paths don't need to set them.
  needsReview:         z.boolean().optional(),
  reviewReasons:       z.array(z.string()).max(20).optional(),
  angleCoherenceScore: z.number().int().min(0).max(10).optional(),
  seo: z.object({
    metaTitle:       z.string().nullable().default(null),
    metaDescription: z.string().nullable().default(null),
  }).default({ metaTitle: null, metaDescription: null }),
});

export const UpdateStorySchema = CreateStorySchema.partial();

export const ListStoriesQuerySchema = z.object({
  category: z.string().optional(),
  status:   z.enum(['draft', 'published', 'archived']).optional(),
  tag:      z.string().optional(),
  search:   z.string().optional(),
  sessionKey:   z.string().optional(),
  scopeKind:    z.enum(['session', 'driver', 'team']).optional(),
  driverNumber: z.coerce.number().int().positive().optional(),
  teamId:       z.string().optional(),
  parentStoryId: z.string().optional(),
  page:     z.coerce.number().int().positive().default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateStoryInput       = z.infer<typeof CreateStorySchema>;
export type UpdateStoryInput       = z.infer<typeof UpdateStorySchema>;
export type ListStoriesQueryInput  = z.infer<typeof ListStoriesQuerySchema>;
