import { z } from 'zod'

/**
 * A spread's data pack: the numbers behind the modules the match table can't
 * draw. Built by vizmaya-data/football-seasons/scripts/spread_packs, stored in
 * `admin_spread_packs`, never edited in the admin. The spread's editorial row
 * stays on the book plan; a pack only supplies data and the club's design.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const clubTokenSchema = z.object({
  family: z.enum(['heater', 'roundel', 'oval', 'plate']),
  pattern: z.enum(['plain', 'sleeves', 'halves', 'stripes', 'hoops', 'band', 'panel', 'trim']),
  c1: hex,
  c2: hex.nullable(),
})
export type ClubToken = z.infer<typeof clubTokenSchema>

const result = z.enum(['W', 'D', 'L'])
const position = z.enum(['FW', 'MF', 'DF', 'GK'])

const runRowSchema = z.object({
  label: z.string(),
  opp: z.string(),
  token: clubTokenSchema.nullable(),
  legs: z.string(),
  right: z.string(),
  out: z.boolean().optional(),
  won: z.boolean().optional(),
  /** Group cards: six results in date order instead of a score. */
  dots: z.array(result).optional(),
})
export type RunRow = z.infer<typeof runRowSchema>

const runSchema = z.object({
  comp: z.enum(['UCL', 'UC', 'LC', 'FAC', 'CS']),
  sub: z.string(),
  rows: z.array(runRowSchema).min(1),
})
export type CupRun = z.infer<typeof runSchema>

const xiPlayerSchema = z.object({ shirt: z.string(), name: z.string(), new: z.boolean().optional() })
export type XiPlayer = z.infer<typeof xiPlayerSchema>

const radarAxis = z.object({ v: z.number(), rank: z.number().int() })
const radarRange = z.object({ min: z.number(), max: z.number(), avg: z.number() })
const RADAR_KEYS = ['gpg', 'win', 'away', 'cpg', 'cs', 'cards'] as const
export type RadarKey = typeof RADAR_KEYS[number]

const transferSchema = z.object({
  name: z.string(),
  pos: position,
  code: z.string(),
  token: clubTokenSchema.nullable(),
  fee: z.string(),
  jan: z.boolean(),
})
export type TransferRow = z.infer<typeof transferSchema>

export const teamPackSchema = z.object({
  kind: z.literal('team'),
  name: z.string(),
  short: z.string(),
  code: z.string(),
  kicker: z.string(),
  token: clubTokenSchema,
  design: z.object({
    /** Headline line breaks; used while the row's headline still reads the same. */
    headline: z.array(z.string()).max(2),
    outEdge: hex,
    outName: z.string(),
    accentName: z.string(),
    keyline: hex,
  }),
  league: z.object({ pos: z.number().int(), pts: z.number().int(), W: z.number().int(), D: z.number().int(), L: z.number().int(), GF: z.number().int(), GA: z.number().int() }),
  all: z.object({ n: z.number().int(), W: z.number().int(), D: z.number().int(), L: z.number().int(), GF: z.number().int(), GA: z.number().int() }),
  rounds: z.array(z.object({ n: z.number().int(), d: z.string(), pos: z.number().int() })).min(1),
  /** Every competitive match: date, competition, result (a shoot-out is a draw). */
  matches: z.array(z.object({ d: z.string(), c: z.enum(['PL', 'UCL', 'UC', 'FAC', 'LC', 'CS']), r: result })),
  runs: z.array(runSchema),
  xis: z.array(z.object({
    label: z.string(),
    shape: z.string(),
    lines: z.object({ gk: z.array(xiPlayerSchema), d: z.array(xiPlayerSchema), m: z.array(xiPlayerSchema), f: z.array(xiPlayerSchema) }),
  })).length(2),
  bubbles: z.array(z.object({ label: z.string(), pos: position, min: z.number().int(), goals: z.number().int(), games: z.number().int() })),
  window: z.object({ in: z.array(transferSchema), out: z.array(transferSchema), inTotal: z.string(), outTotal: z.string(), note: z.string() }),
  radar: z.object({ gpg: radarAxis, win: radarAxis, away: radarAxis, cpg: radarAxis, cs: radarAxis, cards: radarAxis }),
  radarRange: z.object({ gpg: radarRange, win: radarRange, away: radarRange, cpg: radarRange, cs: radarRange, cards: radarRange }),
  sources: z.string(),
})
export type TeamPack = z.infer<typeof teamPackSchema>

export const leaguePackSchema = z.object({
  kind: z.literal('league'),
  name: z.string(),
  /** Names with their honours, the first three set large on the spread. */
  honours: z.array(z.object({ name: z.string(), token: clubTokenSchema.nullable(), items: z.array(z.string()) })),
  teamOfYear: z.object({ title: z.string(), players: z.array(z.string()) }),
  monthly: z.array(z.object({ month: z.string(), player: z.string(), code: z.string(), token: clubTokenSchema.nullable() })),
  monthlyNote: z.string(),
  signings: z.object({
    title: z.string(),
    rows: z.array(z.object({ code: z.string(), token: clubTokenSchema.nullable(), total: z.string(), value: z.number(), note: z.string().optional() })),
    note: z.string(),
  }),
  scorers: z.array(z.object({ player: z.string(), goals: z.number().int(), token: clubTokenSchema.nullable() })),
  sources: z.string(),
})
export type LeaguePack = z.infer<typeof leaguePackSchema>

export const spreadPackSchema = z.discriminatedUnion('kind', [teamPackSchema, leaguePackSchema])
export type SpreadPack = z.infer<typeof spreadPackSchema>
