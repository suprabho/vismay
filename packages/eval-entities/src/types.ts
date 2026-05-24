/**
 * Shared types for the entity-tagging eval runner.
 *
 * Each app (vizf1, footshort, …) ships an `EntityEvalAdapter` that knows how
 * to pull a sample of fully-processed articles + their currently-tagged
 * entities. The runner is app-agnostic: it judges those tags against the
 * article text, computes precision/recall/F1, and renders a report.
 */

/** A canonical entity already attached to an article in the DB. */
export type TaggedEntity = {
  type: string; // app-specific: 'driver'|'constructor'|'circuit' | 'league'|'team'|'player'
  id: string; // canonical ID/UUID
  name: string; // display name (what the judge actually grades)
};

/** A single article pulled for evaluation. */
export type EvalArticle = {
  id: string;
  url: string;
  publisher: string;
  headline: string;
  /** Same text the extractor saw — Gemini summary if present, else RSS snippet. */
  body: string;
  publishedAt: string;
  taggedEntities: TaggedEntity[];
};

export type SampleOpts = {
  since: string; // ISO timestamp
  max: number;
};

export interface EntityEvalAdapter {
  /** Slug for filenames + report header, e.g. 'vizf1' or 'footshort'. */
  appName: string;
  /** Canonical entity types this app knows about. Drives per-type metric rollups. */
  entityTypes: readonly string[];
  /** Pull a sample of summarised articles + their tagged entities. */
  fetchSample(opts: SampleOpts): Promise<EvalArticle[]>;
  /**
   * Optional: re-run the live extraction + resolution pipeline on one article.
   * When provided, callers can opt into measuring the current code (HEAD) on the
   * sampled bodies instead of historical DB state — useful for A/B-ing prompt
   * changes without waiting for new articles to ingest.
   */
  extractLive?(input: { headline: string; body: string; publisher: string }): Promise<TaggedEntity[]>;
}

/**
 * Judge verdict for one article.
 *
 * The judge sees the article body + the list of (name, type) the pipeline
 * tagged, and produces:
 *  - correct: tags that are genuinely about-subject of the article
 *  - spurious: tags that shouldn't be there (hallucination, wrong canonical, weak mention)
 *  - missing: entities the article IS about that weren't tagged (recall gap)
 */
export type JudgeVerdict = {
  correct: Array<{ type: string; name: string }>;
  spurious: Array<{ type: string; name: string; reason: string }>;
  missing: Array<{ type: string; name: string; reason: string }>;
  notes: string;
};

export type ArticleResult = {
  article: EvalArticle;
  verdict: JudgeVerdict | { error: string };
};

export type RunOpts = {
  since: string;
  max: number;
  /** Parallel judge calls. */
  concurrency: number;
  /** Gemini model name passed to @google/genai. */
  judgeModel: string;
  /** Output directory for the HTML + JSON reports. Defaults to monorepo root. */
  outputDir?: string;
  /**
   * Re-extract entities on each sampled article using the adapter's live
   * pipeline (HEAD code) instead of reading historical DB state. Requires
   * adapter.extractLive. Use this to A/B prompt or resolver changes against
   * the same article set as a prior baseline run.
   */
  rerunExtraction?: boolean;
};

/** Aggregate metrics over a run. Computed from ArticleResult[]. */
export type Metrics = {
  articles: number;
  errored: number;
  totals: PRF; // precision/recall/F1 over all entity types
  byType: Record<string, PRF & { support: number }>; // support = # judged tags of this type (correct + missing)
  byPublisher: Array<{
    publisher: string;
    articles: number;
    spurious: number;
    missing: number;
  }>;
};

export type PRF = {
  /** True positives — entities the judge confirmed are about-subject. */
  correct: number;
  /** False positives — tagged but shouldn't be. */
  spurious: number;
  /** False negatives — should be tagged but weren't. */
  missing: number;
  precision: number; // correct / (correct + spurious), 0 when denom=0
  recall: number; // correct / (correct + missing), 0 when denom=0
  f1: number;
};
