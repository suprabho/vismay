import { generateStructured } from './ai'
import { anglesBriefSchema } from './schema'
import { anglesSystem, renderSources } from './prompts'
import type { GenerateOptions } from './generate'
import type { AnglesBrief, SourceDoc } from './types'

/**
 * Steer applied when the author launches the "Create recap" flow: the attached
 * sources are daily match-day recaps, so the angles must tell the story of the
 * day's football rather than drift into evergreen explainers or lone profiles.
 */
const RECAP_FOCUS_STEER =
  `\n\nEDITORIAL FOCUS — MATCH-DAY RECAP:\n` +
  `The sources are daily match-day football recaps. Every angle MUST be a way to tell the ` +
  `STORY OF THE DAY'S FOOTBALL — the results, standout performances, drama and turning points, ` +
  `and what they change in the title / European / relegation races. Favour angles that lead with ` +
  `what actually happened across the fixtures over evergreen explainers or single-player ` +
  `profiles. Keep every angle grounded strictly in the recap facts — do not invent results, ` +
  `scorelines or quotes.`

/**
 * The canvas compose flow's research gate. Reads the sources and returns a brief
 * plus 3–5 rich angles (title + thesis + rationale) the author chooses between
 * — the angle replaces the clarifying-questions form of the classic flow. Each
 * angle gets a stable `a<n>` id for selection/persistence.
 *
 * `focus: 'recap'` biases the angles toward a match-day recap (the "Create
 * recap" button in the sources stage) without changing the schema or pack.
 */
export async function generateAngles(
  sources: SourceDoc[],
  opts: GenerateOptions & {
    refine?: { feedback: string; previous: unknown }
    focus?: 'recap'
  } = {},
): Promise<AnglesBrief> {
  let prompt = renderSources(sources)
  if (opts.focus === 'recap') prompt += RECAP_FOCUS_STEER
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
