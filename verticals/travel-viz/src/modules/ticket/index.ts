import { z } from 'zod'
import type { VizModule } from '@vismay/viz-engine'
import { parseWithSchema } from '@vismay/viz-engine'

/**
 * `travel:ticket` — an admission-stub / order-ticket card. Carries a spread
 * that has no photos (a deli order slip, an observation-deck stub) or accents
 * a museum spread with its admission ticket.
 */
export const ticketSchema = z.object({
  type: z.literal('travel:ticket'),
  title: z
    .string()
    .refine((s) => s.trim().length > 0, 'title is required')
    .describe('Big line on the stub, e.g. "KATZ\'S DELICATESSEN".'),
  venue: z.string().optional().describe('Secondary line, e.g. "205 E Houston St".'),
  time: z.string().optional().describe('Displayed time, e.g. "9:00 AM".'),
  line: z
    .string()
    .optional()
    .describe('One free-form detail line, e.g. "No. 47 · pastrami on rye".'),
  price: z.string().optional().describe('Corner price, e.g. "$27.45".'),
  stampText: z
    .string()
    .optional()
    .describe('Round overlay stamp text, e.g. "ADMIT ONE".'),
  color: z
    .string()
    .default('#2ca068')
    .describe('Accent color (edge bar, stamp ink). Defaults to the day color.'),
  rotation: z.number().min(-10).max(10).default(0).describe('Tilt in degrees.'),
  enterDelay: z.number().min(0).max(2000).optional().describe('Entrance stagger in ms.'),
})

export type TicketLayerConfig = z.infer<typeof ticketSchema>

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): TicketLayerConfig {
  return parseWithSchema(ticketSchema, raw, ctx)
}

const ticketModule: VizModule<TicketLayerConfig> = {
  type: 'travel:ticket',
  label: 'Ticket stub',
  slots: ['foreground'],
  schema: ticketSchema,
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'first-paint',
  stableIdentity: (config) => `travel:ticket:${config.title}::${config.time ?? ''}`,
  defaultStyle: {
    pointerEvents: 'none',
  },
  adminForm: () => [
    { kind: 'text', key: 'title', label: 'Title', required: true, placeholder: "KATZ'S DELICATESSEN" },
    { kind: 'text', key: 'venue', label: 'Venue / address' },
    { kind: 'text', key: 'time', label: 'Time', placeholder: '9:00 AM' },
    { kind: 'text', key: 'line', label: 'Detail line', placeholder: 'No. 47 · pastrami on rye' },
    { kind: 'text', key: 'price', label: 'Price' },
    { kind: 'text', key: 'stampText', label: 'Stamp text', placeholder: 'ADMIT ONE' },
    { kind: 'text', key: 'color', label: 'Accent color' },
    { kind: 'number', key: 'rotation', label: 'Rotation (deg)' },
  ],
}

export default ticketModule
