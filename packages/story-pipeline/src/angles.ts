import { generateStructured } from './ai'
import { anglesBriefSchema } from './schema'
import { anglesSystem, renderSources } from './prompts'
import type { GenerateOptions } from './generate'
import type { AnglesBrief, SourceDoc } from './types'

/**
 * The canvas compose flow's research gate. Reads the sources and returns a brief
 * plus 3–5 rich angles (title + thesis + rationale) the author chooses between
 * — the angle replaces the clarifying-questions form of the classic flow. Each
 * angle gets a stable `a<n>` id for selection/persistence.
 */
export async function generateAngles(
  sources: SourceDoc[],
  opts: GenerateOptions & { refine?: { feedback: string; previous: unknown } } = {},
): Promise<AnglesBrief> {
  let prompt = renderSources(sources)
  if (opts.refine) {
    prompt +=
      `\n\nPREVIOUS ANGLES:\n${JSON.stringify(opts.refine.previous)}\n\n` +
      `Revise the angles per this feedback (keep what works, change only what's noted):\n${opts.refine.feedback}`
  }
  const r = await generateStructured({
    model: opts.model,
    system: anglesSystem(opts.pack),
    prompt,
    schema: anglesBriefSchema,
    metadata: { feature: 'story-pipeline-angles' },
  })
  return {
    summary: r.summary,
    keyFacts: r.keyFacts,
    entities: r.entities,
    suggestedFormat: r.suggestedFormat,
    angles: r.angles.map((a, i) => ({ id: `a${i + 1}`, ...a })),
  }
}
