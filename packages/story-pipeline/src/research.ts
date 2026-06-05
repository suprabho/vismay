import { generateText } from '@vismay/ai-gateway'
import { researchBriefSchema } from './schema'
import { RESEARCH_SYSTEM, renderSources } from './prompts'
import type { ResearchBrief, SourceDoc } from './types'

export interface ResearchOptions {
  /** Override the model alias (e.g. `text.pro`). Defaults to `text.pro`. */
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
  const { result } = await generateText({
    model: opts.model ?? 'text.pro',
    system: RESEARCH_SYSTEM,
    prompt: renderSources(sources),
    schema: researchBriefSchema,
    metadata: { feature: 'story-pipeline-research' },
  })
  return result
}
