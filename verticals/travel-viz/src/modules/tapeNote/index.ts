import { z } from 'zod'
import type { VizModule } from '@vismay/viz-engine'
import { parseWithSchema } from '@vismay/viz-engine'

/**
 * `travel:tapeNote` — a handwritten note on a scrap of paper, taped to the
 * page. The scrapbook's voice for tips, attributions ("Ritwik's pick ✓"),
 * anecdotes, "+ N more" asides, and sign-offs.
 */
export const tapeNoteSchema = z.object({
  type: z.literal('travel:tapeNote'),
  text: z
    .string()
    .refine((s) => s.trim().length > 0, 'text is required')
    .describe('The handwritten note body (Caveat).'),
  title: z
    .string()
    .optional()
    .describe('Optional micro-heading above the note (Space Mono caps).'),
  rotation: z
    .number()
    .min(-10)
    .max(10)
    .default(0)
    .describe('Tilt in degrees. Notes read best within ±4.'),
  paper: z
    .enum(['scrap', 'index', 'sticky'])
    .default('scrap')
    .describe('Paper stock: torn scrap, ruled index card, or sticky note.'),
  tape: z
    .enum(['top', 'corner', 'none'])
    .default('top')
    .describe('Masking-tape accent.'),
  ink: z.string().optional().describe('Ink color override (defaults to warm dark brown).'),
  href: z
    .string()
    .optional()
    .describe('Optional link — the note becomes a small tap target (e.g. "see all 105 →").'),
  enterDelay: z
    .number()
    .min(0)
    .max(2000)
    .optional()
    .describe('Entrance-animation stagger in ms.'),
})

export type TapeNoteLayerConfig = z.infer<typeof tapeNoteSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TapeNoteLayerConfig {
  return parseWithSchema(tapeNoteSchema, raw, ctx)
}

const tapeNoteModule: VizModule<TapeNoteLayerConfig> = {
  type: 'travel:tapeNote',
  label: 'Taped note',
  slots: ['foreground'],
  schema: tapeNoteSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `travel:tapeNote:${config.text}::${config.paper ?? 'scrap'}`,
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'text', key: 'text', label: 'Note', required: true, placeholder: 'split a sandwich — trust us' },
    { kind: 'text', key: 'title', label: 'Micro-heading', placeholder: 'TIP' },
    { kind: 'number', key: 'rotation', label: 'Rotation (deg)' },
    {
      kind: 'select',
      key: 'paper',
      label: 'Paper',
      options: [
        { value: 'scrap', label: 'Torn scrap' },
        { value: 'index', label: 'Index card' },
        { value: 'sticky', label: 'Sticky note' },
      ],
    },
    {
      kind: 'select',
      key: 'tape',
      label: 'Tape',
      options: [
        { value: 'top', label: 'Top strip' },
        { value: 'corner', label: 'Corner piece' },
        { value: 'none', label: 'None' },
      ],
    },
    { kind: 'text', key: 'href', label: 'Link (optional)', placeholder: '/t/new-york-2026' },
  ],
}

export default tapeNoteModule
