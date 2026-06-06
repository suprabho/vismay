import { generateStructured } from './ai'
import { researchBriefSchema } from './schema'
import { RESEARCH_SYSTEM, renderSources } from './prompts'
import type { ResearchBrief, SourceDoc } from './types'

export interface ResearchOptions {
  /** Override the model alias. Defaults to DEFAULT_TEXT_MODEL. */
  model?: string
}

/**
 * Phase 1 — read the sources and return a brief plus the clarifying questions
 * that gate generation. The model is constrained by `researchBriefSchema`, so
 * the result is already typed and valid.
 */
export async function research(
  sources: SourceDoc[],
  opts: ResearchOptions = {},
): Promise<ResearchBrief> {
  return generateStructured({
    model: opts.model,
    system: RESEARCH_SYSTEM,
    prompt: renderSources(sources),
    schema: researchBriefSchema,
    metadata: { feature: 'story-pipeline-research' },
  })
}
