import { z } from 'zod';

// =====================================================
// Entity
// =====================================================

export const EntityTypeSchema = z.enum(['league', 'team', 'player']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntitySchema = z.object({
  id: z.string().uuid(),
  type: EntityTypeSchema,
  slug: z.string(),
  name: z.string(),
  football_data_id: z.number().int().nullable(),
  api_football_id: z.number().int().nullable(),
  country: z.string().nullable(),
  league_slug: z.string().nullable(),
  team_slug: z.string().nullable(),
  crest_url: z.string().url().nullable(),
  created_at: z.string(),
});
export type Entity = z.infer<typeof EntitySchema>;

// =====================================================
// Article
// =====================================================

export const ArticleStatusSchema = z.enum([
  'pending',
  'summarized',
  'failed',
  'hidden',
]);
export type ArticleStatus = z.infer<typeof ArticleStatusSchema>;

export const ArticleSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  url_hash: z.string(),
  publisher: z.string(),
  headline: z.string(),
  original_snippet: z.string().nullable(),
  image_url: z.string().url().nullable(),
  published_at: z.string(),
  ingested_at: z.string(),
  summary: z.string().nullable(),
  summary_model: z.string().nullable(),
  summary_at: z.string().nullable(),
  cluster_id: z.string().uuid().nullable(),
  is_cluster_lead: z.boolean(),
  status: ArticleStatusSchema,
  failure_reason: z.string().nullable(),
});
export type Article = z.infer<typeof ArticleSchema>;

// =====================================================
// Feed card (what the app actually renders)
// =====================================================

export const FeedCardSchema = z.object({
  article_id: z.string().uuid(),
  headline: z.string(),
  summary: z.string(),
  image_url: z.string().url().nullable(),
  publisher: z.string(),
  url: z.string().url(),
  published_at: z.string(),
  cluster_id: z.string().uuid().nullable(),
  // joined on client or via RPC
  entities: z.array(EntitySchema).optional(),
});
export type FeedCard = z.infer<typeof FeedCardSchema>;

// =====================================================
// Gemini output schemas (structured output)
// =====================================================

export const TopicCategorySchema = z.enum([
  'on_pitch',
  'transfer',
  'club_business',
  'off_pitch_personal',
  'other_sport',
  'betting_odds',
  'listicle',
  'unrelated',
]);
export type TopicCategory = z.infer<typeof TopicCategorySchema>;

export const GeminiSummarySchema = z.object({
  is_football_news: z.boolean(),
  topic_category: TopicCategorySchema,
  summary: z.string(),
  entities: z.object({
    leagues: z.array(z.string()),  // league names/slugs Gemini spotted
    teams: z.array(z.string()),
    players: z.array(z.string()),
  }),
});
export type GeminiSummary = z.infer<typeof GeminiSummarySchema>;
