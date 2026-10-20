/**
 * The one shared draw for all three randomizers (playbook 4: "weighted draws,
 * stratification, repeat blocking and region or tradition balancing live in
 * one shared draw function so the rules are consistent").
 *
 * Pure and deterministic: the same seed, history, heat and locks always give
 * the same spin, so a logged spin can be replayed. Every rule that shapes a
 * draw says so in `rules`, which admin shows under the reels and the log
 * keeps.
 *
 * Rules, by playbook section:
 *   0.1  No repeat of a full combination within 90 days; no repeat of the
 *        primary reel value (sub-industry, country, epic) within 30 days,
 *        unless forced by heat (heat at or above HEAT_EXEMPT). Locks fix a
 *        reel to the spin they were set on.
 *   1.3  Desk: 60% of draws weighted by heat, 40% pure random. Heat older
 *        than 7 days (or never refreshed) needs a refresh before research; a
 *        failed refresh forces Evergreen. No development inside the drawn
 *        window shifts Breaking to Developing to Evergreen.
 *   2.2  Atlas: region first, then a country inside it; the same region twice
 *        in a row is re-drawn once. Pair spin is meant once a week.
 *   3.2  Epics: at least one in three spins philosophical or foundational;
 *        never the same tradition twice in a row. Sequence mode walks on from
 *        the previous spin's place.
 *
 * Footshorts (the Football Desk) follows the Desk's rules on a football
 * shape: tournament first, then a team inside it, both weighted by news heat
 * in the 60% branch. Heat is not a seed an agent refreshes but the live
 * footshorts feed (articles tagged with each team in the news window, see
 * spins.ts loadFootshortsNews), so it is never stale. Only tournaments with
 * teams that have fixtures in the window are in the draw; the same
 * tournament twice in a row is re-drawn once; no news inside the drawn
 * window shifts Matchday to Running story to Evergreen; the head-to-head
 * option prefers an opponent the team meets in the window.
 *
 * VizNBA (the NBA Desk) has the same shape: a conference first, then a
 * franchise in it, both weighted by the news tagged on VizNBA in the 60%
 * branch (a story about a player or coach counts for his team). All 30
 * franchises are always in the draw; the same conference twice in a row is
 * re-drawn once; no news inside the drawn window shifts Last night to This
 * week to Evergreen; the head-to-head option prefers an opponent from the
 * team's games on ESPN's schedule.
 *
 * The OCW Desk draws from MIT OpenCourseWare in two stages that share one
 * seeded rng, because its course and resource reels come from a live pool
 * (the MIT Learn API behind ocw.mit.edu/search) that depends on the first
 * stage. planOcw() is pure: a field (re-drawn once when it repeats the last
 * spin's, like the Atlas region), a topic in it (minus topics spun in the
 * last 30 days), a resource kind (at least one in three spins hands-on:
 * problem sets, exams or projects), a lens, and one rng draw that picks
 * where in the pool to look. spins.ts fetches that page of files, and
 * draw() runs the plan again from the same seed (so it comes out the same)
 * and picks the file: courses spun in the last 30 days are left out, the
 * full combination (topic, kind, course, lens) is blocked for 90 days, and
 * sequence mode walks to the next file of the previous spin's course.
 */

import { ATLAS, DESK, EPICS, FOOTSHORTS, OCW, VIZNBA, epicRoute, isHandsOn, isPhilosophical } from './datasets'
import { mulberry32, pick, uniq, weighted, type Rng } from './rng'
import { gameSummary, ocwCourseLabel } from './stub'
import {
  GEO_STATUS_TEXT,
  RANDOMIZER_META,
  type AtlasCountry,
  type AtlasDataset,
  type AtlasPicks,
  type DeskDataset,
  type DeskFreshness,
  type DeskHeatRow,
  type DeskPicks,
  type DeskSubIndustry,
  type DrawResult,
  type Epic,
  type EpicsDataset,
  type EpicsPicks,
  type FootshortsCompetition,
  type FootshortsDataset,
  type FootshortsFixtureRef,
  type FootshortsFreshness,
  type FootshortsNews,
  type FootshortsPicks,
  type FootshortsTeamNews,
  type NamedOption,
  type OcwCourse,
  type OcwDataset,
  type OcwField,
  type OcwFile,
  type OcwKind,
  type OcwPicks,
  type OcwPlan,
  type OcwPool,
  type OcwTopic,
  type RandomizerId,
  type RuleFired,
  type SpinHistoryEntry,
  type SpinPicks,
  type ViznbaConference,
  type ViznbaDataset,
  type ViznbaFreshness,
  type ViznbaNews,
  type ViznbaPicks,
  type ViznbaTeamNews,
} from './types'

/** The tunable numbers behind the rules, in one place. */
export const DRAW_RULES = {
  /** Share of Desk draws weighted by heat (the rest are pure random). */
  heatShare: 0.6,
  /**
   * Heat at or above this lets a sub-industry back in despite a spin in the
   * last 30 days. The playbook says "unless forced by the heat weighting"
   * without a number; this is the number.
   */
  heatExempt: 85,
  /**
   * A heat exemption still waits this long after the segment's last spin, so a
   * hot segment comes back now and then instead of on every spin once the rest
   * of the pool is blocked.
   */
  heatExemptCooldownDays: 7,
  primaryBlockDays: 30,
  comboBlockDays: 90,
  heatStaleDays: 7,
  pairEveryDays: 7,
  /**
   * Footshorts: added to every tournament's heat in the weighted branch, so a
   * quiet (or off-season) tournament keeps a small chance.
   */
  competitionHeatFloor: 5,
  /** Footshorts: at most this many fixtures' match context in a spin's brief. */
  maxSpinFixtures: 8,
  /** NBA Desk: at most this many games' box scores in a spin's brief. */
  maxSpinGames: 6,
  /** OCW Desk: files per pool page (one API call), and the search endpoint's hard limit on offset + page. */
  ocwPageSize: 30,
  ocwSearchCap: 10000,
  /** OCW Desk: at most this many sibling files (same course, same kind) kept on a spin. */
  maxOcwSiblings: 40,
} as const

const DAY = 864e5

export interface DrawInput {
  randomizer: RandomizerId
  seed: number
  now?: Date
  /** This randomizer's past spins. Rejected spins are ignored. */
  history?: SpinHistoryEntry[]
  /** The spin the locks refer to (the one on screen when Spin was pressed). */
  prev?: { picks: SpinPicks } | null
  locks?: string[]
  /** Atlas: draw a second country. Footshorts and the NBA Desk: draw a head-to-head opponent. */
  pair?: boolean
  /** Epics: continue from the previous spin's place. */
  sequence?: boolean
  /** Desk: live heat from desk_heat, overriding the dataset's seed values. */
  heat?: DeskHeatRow[]
  /** Footshorts: the live news snapshot (teams with fixtures, their heat and headlines). Required. */
  news?: FootshortsNews | null
  /** NBA Desk: the live news snapshot (franchises, their heat, headlines and games). Required. */
  nbaNews?: ViznbaNews | null
  /** OCW Desk: the page of files planOcw() asked for (spins.ts loadOcwPool). Required. */
  ocwPool?: OcwPool | null
  /** For tests: swap a dataset. */
  datasets?: { desk?: DeskDataset; atlas?: AtlasDataset; epics?: EpicsDataset; ocw?: OcwDataset; footshorts?: FootshortsDataset; viznba?: ViznbaDataset }
}

/**
 * The locks a draw actually honours: known, lockable reels, with their parents
 * (a sub-industry lock implies its industry; a place lock its episode and epic).
 */
export function normalizeLocks(randomizer: RandomizerId, locks: readonly string[] = []): string[] {
  const reels = RANDOMIZER_META[randomizer].reels.filter((r) => !r.option)
  const out = new Set<string>()
  for (const key of locks) {
    const reel = reels.find((r) => r.key === key)
    if (!reel) continue
    out.add(key)
    for (const p of reel.parents ?? []) out.add(p)
  }
  return reels.map((r) => r.key).filter((k) => out.has(k))
}

interface Ctx {
  rng: Rng
  now: number
  rules: RuleFired[]
  locked: (key: string) => boolean
  /** Kept (non-rejected) spins before now, oldest first. */
  kept: SpinHistoryEntry[]
  within: (entry: SpinHistoryEntry, days: number) => boolean
}

function rule(ctx: Ctx, tag: string, kind: RuleFired['kind'], text: string): void {
  ctx.rules.push({ tag, kind, text })
}

function recent(ctx: Ctx, days: number, field: 'primary' | 'combo'): Set<string> {
  return new Set(ctx.kept.filter((e) => ctx.within(e, days)).map((e) => e[field]))
}

/** When each primary value was last spun (kept spins only). */
function lastSpun(ctx: Ctx): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of ctx.kept) out.set(e.primary, Date.parse(e.createdAt))
  return out
}

/**
 * The 30-day primary block, shared by the heat-weighted desks. A value spun in
 * the last 30 days is left out unless its heat is at or above `heatExempt` AND
 * its last spin is at least `heatExemptCooldownDays` old. When that leaves
 * nothing, the block lifts to the values spun longest ago, never to the whole
 * pool, so the draw keeps rotating instead of settling on a few hot values.
 */
function eligible<T>(
  ctx: Ctx,
  pool: readonly T[],
  opts: { id: (x: T) => string; name: (x: T) => string; heat: (x: T) => number; the?: string; heatLabel: string; everyText: string },
): T[] {
  const last = lastSpun(ctx)
  const ago = (x: T) => {
    const t = last.get(opts.id(x))
    return t === undefined ? Infinity : ctx.now - t
  }
  const blocked = pool.filter((x) => ago(x) < DRAW_RULES.primaryBlockDays * DAY)
  const exempt = blocked.filter((x) => opts.heat(x) >= DRAW_RULES.heatExempt && ago(x) >= DRAW_RULES.heatExemptCooldownDays * DAY)
  const left = blocked.filter((x) => !exempt.includes(x))
  const the = opts.the ?? ''
  let cands = pool.filter((x) => !left.includes(x))
  if (left.length) rule(ctx, '30 days', 'block', `Left out ${the}${list(left.map(opts.name))}: spun in the last 30 days.`)
  if (exempt.length) {
    const cap = (the + list(exempt.map(opts.name))).replace(/^./, (c) => c.toUpperCase())
    rule(ctx, '30 days', 'warn', `${cap} allowed back in despite a recent spin: ${opts.heatLabel} ${DRAW_RULES.heatExempt} or above forces it.`)
  }
  if (!cands.length && pool.length) {
    // Lift the block to the oldest third of the pool (at least one value).
    const byAge = [...pool].sort((a, b) => ago(b) - ago(a))
    const keep = Math.max(1, Math.ceil(pool.length / 3))
    const cutoff = ago(byAge[keep - 1]!)
    cands = byAge.filter((x) => ago(x) >= cutoff)
    rule(ctx, '30 days', 'warn', `${opts.everyText} The block is lifted for the ${cands.length} spun longest ago: ${the}${list(cands.map(opts.name))}.`)
  }
  return cands
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The seeded context every draw (and the OCW plan) starts from. */
function context(input: DrawInput): Ctx {
  const now = (input.now ?? new Date()).getTime()
  const locks = new Set(normalizeLocks(input.randomizer, input.locks))
  const prev = input.prev ?? null
  const kept = (input.history ?? [])
    .filter((e) => e.status !== 'rejected' && Date.parse(e.createdAt) <= now)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const ctx: Ctx = {
    rng: mulberry32(input.seed),
    now,
    rules: [],
    // A lock means "keep what the previous spin had": with nothing to keep, it is ignored.
    locked: (key) => !!prev && locks.has(key),
    kept,
    within: (e, days) => now - Date.parse(e.createdAt) < days * DAY,
  }
  if (locks.size && !prev) rule(ctx, 'lock', 'info', 'Locks need a spin on screen to keep values from. Drawing every reel fresh.')
  return ctx
}

/**
 * The OCW Desk's first stage, on its own: what the pool loader needs before
 * draw() can finish. Pure; the same input gives the same plan draw() will
 * reproduce. The rules it fires are repeated by draw(), so they are dropped here.
 */
export function planOcw(input: DrawInput): OcwPlan {
  const ctx = context(input)
  return ocwPlan(ctx, input.datasets?.ocw ?? OCW, input.prev?.picks as OcwPicks | undefined, !!input.sequence)
}

export function draw(input: DrawInput): DrawResult {
  const ctx = context(input)
  const prev = input.prev ?? null

  if (input.randomizer === 'desk') return drawDesk(ctx, input.datasets?.desk ?? DESK, prev?.picks as DeskPicks | undefined, input.heat ?? [])
  if (input.randomizer === 'atlas') return drawAtlas(ctx, input.datasets?.atlas ?? ATLAS, prev?.picks as AtlasPicks | undefined, !!input.pair)
  if (input.randomizer === 'footshorts') {
    return drawFootshorts(ctx, input.datasets?.footshorts ?? FOOTSHORTS, prev?.picks as FootshortsPicks | undefined, input.news ?? null, !!input.pair)
  }
  if (input.randomizer === 'viznba') {
    return drawViznba(ctx, input.datasets?.viznba ?? VIZNBA, prev?.picks as ViznbaPicks | undefined, input.nbaNews ?? null, !!input.pair)
  }
  if (input.randomizer === 'ocw') {
    return drawOcw(ctx, input.datasets?.ocw ?? OCW, prev?.picks as OcwPicks | undefined, input.ocwPool ?? null, !!input.sequence)
  }
  return drawEpics(ctx, input.datasets?.epics ?? EPICS, prev?.picks as EpicsPicks | undefined, !!input.sequence)
}

/* ---------- Desk ---------- */

function drawDesk(ctx: Ctx, data: DeskDataset, prev: DeskPicks | undefined, heatRows: DeskHeatRow[]): DrawResult {
  const { rng } = ctx
  const live = new Map(heatRows.map((h) => [h.subId, h]))
  const heatOf = (s: DeskSubIndustry) => live.get(s.id)?.heat ?? s.heat
  const subById = (id: string) => data.sub_industries.find((s) => s.id === id)
  const prevSub = prev ? subById(prev.subId) : undefined

  let pool = data.sub_industries
  if (ctx.locked('industry') && prevSub) {
    pool = pool.filter((s) => s.industry === prevSub.industry)
    const ind = data.industries.find((i) => i.id === prevSub.industry)
    rule(ctx, 'lock', 'info', `Industry locked to ${ind?.name ?? prevSub.industry}. Only its segments are in the draw.`)
  }

  let sub: DeskSubIndustry
  if (ctx.locked('sub') && prevSub) {
    sub = prevSub
    rule(ctx, 'lock', 'info', `Sub-industry locked to ${sub.name}.`)
  } else {
    const cands = eligible(ctx, pool, {
      id: (s) => s.id,
      name: (s) => s.name,
      heat: heatOf,
      heatLabel: 'heat',
      everyText: 'Every eligible segment was spun in the last 30 days.',
    })
    if (rng() < DRAW_RULES.heatShare) {
      sub = weighted(cands, heatOf, rng)
      const total = cands.reduce((a, s) => a + heatOf(s), 0)
      const pct = total > 0 ? Math.round((heatOf(sub) / total) * 100) : Math.round(100 / cands.length)
      rule(ctx, 'weight', 'good', `Heat-weighted draw (the 60% branch). ${sub.name} had a ${pct}% chance among ${cands.length} eligible segments.`)
    } else {
      sub = pick(cands, rng)
      rule(ctx, 'weight', 'info', `Pure random draw (the 40% branch). All ${cands.length} eligible segments had an equal ${Math.round(100 / cands.length)}% chance.`)
    }
  }

  const lensByName = (name: string) => data.lenses.find((l) => l.name === name)
  const freshByName = (name: string) => data.freshness.find((f) => f.name === name)
  // Prefer a lens this segment has not had in the last 90 days, whatever the freshness.
  const usedLenses = new Set(
    [...recent(ctx, DRAW_RULES.comboBlockDays, 'combo')].filter((c) => c.startsWith(`${sub.id}|`)).map((c) => c.split('|')[1]),
  )
  const freshLenses = data.lenses.filter((l) => !usedLenses.has(l.name))
  const lensPool = freshLenses.length ? freshLenses : data.lenses
  let lens = (ctx.locked('lens') && prev && lensByName(prev.lens)) || pick(lensPool, rng)
  if (!ctx.locked('lens') && usedLenses.size && freshLenses.length) {
    rule(ctx, '90 days', 'info', `${sub.name} already had the ${list([...usedLenses])} lens in the last 90 days, so the lens was drawn from the others.`)
  }
  let freshDrawn = (ctx.locked('fresh') && prev && freshByName(prev.freshDrawn)) || pick(data.freshness, rng)

  // Staleness and the freshness fallback.
  const row = live.get(sub.id)
  const heat = heatOf(sub)
  const heatUpdated = row ? row.heatUpdated : sub.heat_updated
  const headlines = row ? row.topHeadlines : sub.top_headlines
  const ageDays = heatUpdated ? Math.floor((ctx.now - Date.parse(heatUpdated)) / DAY) : null
  const heatStale = ageDays === null || ageDays > DRAW_RULES.heatStaleDays
  const refreshFailed = row?.refreshStatus === 'failed'
  const newest = headlines.map((h) => Date.parse(h.date)).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a)[0]
  const lastDev = newest === undefined ? null : Math.max(0, Math.floor((ctx.now - newest) / DAY))
  const evergreen = data.freshness[data.freshness.length - 1]!
  const resolve = (drawn: DeskFreshness): DeskFreshness => {
    if (refreshFailed) return evergreen
    let i = data.freshness.indexOf(drawn)
    while (lastDev !== null && i < data.freshness.length - 1 && data.freshness[i]!.days !== null && lastDev > data.freshness[i]!.days!) i++
    return data.freshness[i]!
  }
  let fresh = resolve(freshDrawn)

  // 90-day block on the full combination: re-draw the reels that are free.
  const combo = () => `${sub.id}|${lens.name}|${fresh.name}`
  const r90 = recent(ctx, DRAW_RULES.comboBlockDays, 'combo')
  if (r90.has(combo())) {
    const first = combo()
    let tries = 0
    while (r90.has(combo()) && tries < 16) {
      tries++
      if (!ctx.locked('lens')) lens = pick(lensPool, rng)
      else if (!ctx.locked('fresh')) {
        freshDrawn = pick(data.freshness, rng)
        fresh = resolve(freshDrawn)
      } else break
    }
    const [, oldLens, oldFresh] = first.split('|')
    if (r90.has(combo())) {
      rule(ctx, '90 days', 'warn', `${sub.name} with the ${oldLens} lens and ${oldFresh} freshness ran in the last 90 days, and the reels that could change are locked. It repeats.`)
    } else {
      rule(ctx, '90 days', 'block', `${sub.name} with the ${oldLens} lens and ${oldFresh} freshness ran in the last 90 days. Re-drawn to avoid the repeat.`)
    }
  }

  if (refreshFailed) {
    rule(ctx, 'refresh', 'block', `The last heat refresh for ${sub.name} failed${row?.refreshError ? ` (${row.refreshError})` : ''}. The spin is Evergreen automatically.`)
  } else if (heatStale) {
    rule(
      ctx,
      'stale',
      'warn',
      ageDays === null
        ? `${sub.name}'s heat (${heat}) is a seed that was never refreshed. Refresh it before research; if the refresh fails, treat the spin as Evergreen.`
        : `Heat score is ${ageDays} days old. A refresh runs before research. If it fails, the spin becomes Evergreen.`,
    )
  }
  if (fresh !== freshDrawn && !refreshFailed) {
    rule(ctx, 'fallback', 'warn', `No development in the ${freshDrawn.name} window (the latest on file is ${lastDev} days old). Shifted to ${fresh.name}; the research file says so.`)
  }
  rule(ctx, 'why now', 'info', `Mandatory next step: pull the three newest developments for ${sub.name} and apply the ${lens.name} lens to the newest one.`)

  const industry = data.industries.find((i) => i.id === sub.industry) ?? { id: sub.industry, name: sub.industry }
  const picks: DeskPicks = { subId: sub.id, lens: lens.name, fresh: fresh.name, freshDrawn: freshDrawn.name }
  return {
    randomizer: 'desk',
    picks,
    subject: {
      randomizer: 'desk',
      industry,
      sub: { ...sub, heat, heat_updated: heatUpdated, top_headlines: headlines },
      lens,
      freshness: fresh,
      heatStale,
      refreshFailed,
      lastDevelopmentDays: lastDev,
    },
    reels: {
      industry: { value: industry.name },
      sub: { value: sub.name, sub: `heat ${heat} · ${ageDays === null ? 'never refreshed' : `updated ${ageDays}d ago`}` },
      lens: { value: lens.name },
      fresh: { value: fresh.name, sub: fresh !== freshDrawn ? `drew ${freshDrawn.name}, shifted` : fresh.window },
    },
    primary: sub.id,
    combo: combo(),
    summary: `${sub.name} · ${lens.name}`,
    rules: ctx.rules,
    meta: { heat },
  }
}

/* ---------- Atlas ---------- */

function drawAtlas(ctx: Ctx, data: AtlasDataset, prev: AtlasPicks | undefined, pair: boolean): DrawResult {
  const { rng } = ctx
  const byIso = (iso: string) => data.countries.find((c) => c.iso === iso)
  const last = ctx.kept[ctx.kept.length - 1]

  let country: AtlasCountry
  const prevCountry = prev ? byIso(prev.iso) : undefined
  if (ctx.locked('country') && prevCountry) {
    country = prevCountry
    rule(ctx, 'lock', 'info', `Country locked to ${country.name}.`)
  } else {
    let region = pick(data.regions, rng)
    if (last?.meta.region === region) {
      const again = pick(data.regions, rng)
      rule(
        ctx,
        'balance',
        'warn',
        again === region
          ? `${region} came up twice in a row, so the region was re-drawn once and landed on it again. One re-draw is the rule, so it stands.`
          : `${region} came up twice in a row, so the region was re-drawn once, now ${again}.`,
      )
      region = again
    }
    rule(ctx, 'balance', 'good', `Stratified draw: region first (${region}, 1 in ${data.regions.length}), then a country inside it. No continent dominates.`)
    const inRegion = data.countries.filter((c) => c.region === region)
    const r30 = recent(ctx, DRAW_RULES.primaryBlockDays, 'primary')
    const blocked = inRegion.filter((c) => r30.has(c.iso))
    const cands = inRegion.filter((c) => !r30.has(c.iso))
    if (blocked.length) rule(ctx, '30 days', 'block', `Left out ${list(blocked.map((c) => c.name))}: spun in the last 30 days.`)
    country = pick(cands.length ? cands : inRegion, rng)
  }

  const keep = <T extends { name: string }>(key: 'time' | 'frame' | 'lens', options: T[], prevName?: string): T =>
    (ctx.locked(key) && prevName && options.find((o) => o.name === prevName)) || pick(options, rng)
  let thread = ctx.locked('thread') && prev && data.threads.includes(prev.thread) ? prev.thread : pick(data.threads, rng)
  let time = keep('time', data.time_depths, prev?.time)
  let frame = keep('frame', data.frames, prev?.frame)
  let lens = keep('lens', data.lenses, prev?.lens)

  let partner: AtlasCountry | null = null
  if (pair) {
    partner = pick(data.countries.filter((c) => c.iso !== country.iso), rng)
    const usedThisWeek = ctx.kept.some((e) => e.meta.pair && ctx.within(e, DRAW_RULES.pairEveryDays))
    rule(
      ctx,
      'pair',
      usedThisWeek ? 'warn' : 'info',
      `${usedThisWeek ? 'A pair spin already ran this week; the playbook says once a week. ' : ''}The story is the relationship between ${country.name} and ${partner.name}: a trade corridor, a shared border, a colonial link or a migration channel.`,
    )
  }

  const combo = () => [country.iso, thread, time.name, frame.name, lens.name, partner?.iso].filter(Boolean).join('|')
  const r90 = recent(ctx, DRAW_RULES.comboBlockDays, 'combo')
  if (r90.has(combo())) {
    const free = (['thread', 'lens', 'frame', 'time'] as const).filter((k) => !ctx.locked(k))
    let tries = 0
    while (r90.has(combo()) && free.length && tries < 16) {
      tries++
      const k = pick(free, rng)
      if (k === 'thread') thread = pick(data.threads, rng)
      else if (k === 'lens') lens = pick(data.lenses, rng)
      else if (k === 'frame') frame = pick(data.frames, rng)
      else time = pick(data.time_depths, rng)
    }
    rule(
      ctx,
      '90 days',
      r90.has(combo()) ? 'warn' : 'block',
      r90.has(combo())
        ? 'This exact combination ran in the last 90 days, and every reel that could change is locked. It repeats.'
        : 'The first draw repeated a combination from the last 90 days. The free reels were re-drawn.',
    )
  }

  for (const c of [country, partner]) {
    if (c?.extra) rule(ctx, 'extras', 'warn', `${c.name} is on the extras list (${c.status ?? 'not a UN member'}). Label its status as contested where it is, and state the major positions fairly.`)
  }
  rule(ctx, 'specific', 'info', `Locked to ${country.name}. The route must name 4 to 8 specific places inside it, in story order. A story about a whole continent is a failed spin.`)

  const picks: AtlasPicks = { iso: country.iso, thread, time: time.name, frame: frame.name, lens: lens.name, ...(partner ? { pairIso: partner.iso } : {}) }
  const reels: DrawResult['reels'] = {
    country: { value: country.name, sub: country.extra ? `${country.subregion} · extra` : country.subregion },
    thread: { value: thread },
    time: { value: time.name, sub: time.description },
    frame: { value: frame.name },
    lens: { value: lens.name },
  }
  if (partner) reels.pair = { value: partner.name, sub: partner.subregion }
  return {
    randomizer: 'atlas',
    picks,
    subject: { randomizer: 'atlas', country, pair: partner, thread, time, frame, lens },
    reels,
    primary: country.iso,
    combo: combo(),
    summary: `${country.name}${partner ? ` + ${partner.name}` : ''} · ${thread}`,
    rules: ctx.rules,
    meta: { region: country.region, pair: !!partner },
  }
}

/* ---------- Epics ---------- */

function drawEpics(ctx: Ctx, data: EpicsDataset, prev: EpicsPicks | undefined, sequence: boolean): DrawResult {
  const { rng } = ctx
  const byId = (id: string) => data.epics.find((e) => e.id === id)
  const last = ctx.kept[ctx.kept.length - 1]
  const lastPicks = last?.picks as EpicsPicks | undefined

  let epic: Epic | undefined
  let episodeId: string | undefined
  let placeId: string | undefined
  let continued = false

  if (sequence && !ctx.locked('epic')) {
    const lastEpic = lastPicks ? byId(lastPicks.epicId) : undefined
    if (lastEpic && lastPicks) {
      const route = epicRoute(lastEpic)
      const at = route.findIndex((r) => r.episodeId === lastPicks.episodeId && r.place.id === lastPicks.placeId)
      if (at >= 0 && at < route.length - 1) {
        epic = lastEpic
        episodeId = route[at + 1]!.episodeId
        placeId = route[at + 1]!.place.id
        continued = true
        rule(ctx, 'sequence', 'good', `Sequence mode: continuing ${epic.title} from ${route[at]!.place.name} to the next place on the route. Balancing rules pause while a route is being built.`)
      } else {
        rule(ctx, 'sequence', 'info', `Sequence mode: the ${lastEpic.title} route is complete, so this is a fresh draw.`)
      }
    } else {
      rule(ctx, 'sequence', 'info', 'Sequence mode needs a previous spin to continue from. Drawing fresh.')
    }
  }

  if (!epic) {
    const prevEpic = prev ? byId(prev.epicId) : undefined
    if (ctx.locked('epic') && prevEpic && prev) {
      epic = prevEpic
      rule(ctx, 'lock', 'info', `Epic locked to ${epic.title}.`)
      const prevEp = epic.episodes.find((e) => e.id === prev.episodeId)
      const ep = ctx.locked('episode') && prevEp ? prevEp : pick(epic.episodes, rng)
      if (ctx.locked('episode') && prevEp) rule(ctx, 'lock', 'info', `Episode locked to ${ep.name}.`)
      episodeId = ep.id
      const prevPlace = ep.places.find((p) => p.id === prev.placeId)
      placeId = (ctx.locked('place') && prevPlace ? prevPlace : pick(ep.places, rng)).id
    } else {
      let pool = data.epics
      const lastTwo = ctx.kept.slice(-2)
      if (lastTwo.length === 2 && lastTwo.every((e) => !isPhilosophical(e.meta.types))) {
        pool = pool.filter((e) => isPhilosophical(e.types))
        rule(ctx, 'quota', 'warn', 'The last two spins were neither philosophical nor foundational. To keep one in three, this draw only uses those types.')
      }
      let traditions = data.traditions.filter((t) => pool.some((e) => e.tradition === t))
      const lastTrad = last?.meta.tradition
      if (lastTrad && traditions.length > 1 && traditions.includes(lastTrad)) {
        traditions = traditions.filter((t) => t !== lastTrad)
        rule(ctx, 'balance', 'block', `Skipped ${lastTrad}: it was drawn last time.`)
      }
      const tradition = pick(traditions, rng)
      rule(ctx, 'balance', 'good', `Tradition first (${tradition}, 1 in ${traditions.length}), then an epic inside it.`)
      const inTradition = pool.filter((e) => e.tradition === tradition)
      const r30 = recent(ctx, DRAW_RULES.primaryBlockDays, 'primary')
      const blocked = inTradition.filter((e) => r30.has(e.id))
      const cands = inTradition.filter((e) => !r30.has(e.id))
      if (blocked.length) {
        rule(
          ctx,
          '30 days',
          cands.length ? 'block' : 'warn',
          cands.length
            ? `Left out ${list(blocked.map((e) => e.title))}: spun in the last 30 days.`
            : `Every ${tradition} epic was spun in the last 30 days, so the block is lifted for this draw.`,
        )
      }
      epic = pick(cands.length ? cands : inTradition, rng)
      const ep = pick(epic.episodes, rng)
      episodeId = ep.id
      placeId = pick(ep.places, rng).id
    }
  }

  const episode = epic.episodes.find((e) => e.id === episodeId)!
  let place = episode.places.find((p) => p.id === placeId)!
  let lens = (ctx.locked('lens') && prev && data.lenses.find((l) => l.name === prev.lens)) || pick(data.lenses, rng)

  const combo = () => `${epic!.id}|${episode.id}|${place.id}|${lens.name}`
  const r90 = recent(ctx, DRAW_RULES.comboBlockDays, 'combo')
  if (r90.has(combo())) {
    let tries = 0
    while (r90.has(combo()) && tries < 16) {
      tries++
      if (!ctx.locked('lens')) lens = pick(data.lenses, rng)
      else if (!ctx.locked('place') && !continued && episode.places.length > 1) place = pick(episode.places, rng)
      else break
    }
    rule(
      ctx,
      '90 days',
      r90.has(combo()) ? 'warn' : 'block',
      r90.has(combo())
        ? `${place.name} with the ${lens.name} lens ran in the last 90 days, and the reels that could change are locked. It repeats.`
        : `The first draw repeated a place and lens from the last 90 days. Re-drawn.`,
    )
  }

  rule(
    ctx,
    'status',
    place.status === 'Verified' ? 'good' : place.status === 'Symbolic' ? 'info' : 'warn',
    `${place.name} starts as ${place.status}: ${GEO_STATUS_TEXT[place.status]} Research confirms or changes it.`,
  )
  rule(ctx, 'frame', 'info', `${epic.title} is mostly ${epic.geography_status.dominant}. ${epic.geography_status.note} Say so up front.`)
  if (epic.types.includes('Philosophical and spiritual')) {
    rule(ctx, 'meaning', 'info', 'Philosophical epic: the output must explain what this place means in the argument, citing scholarship.')
  }

  const { episodes, ...epicRecord } = epic
  const picks: EpicsPicks = { epicId: epic.id, episodeId: episode.id, placeId: place.id, lens: lens.name }
  return {
    randomizer: 'epics',
    picks,
    subject: {
      randomizer: 'epics',
      epic: { ...epicRecord, place_count: episodes.reduce((n, e) => n + e.places.length, 0) },
      episode,
      place,
      lens,
      sequence: continued,
    },
    reels: {
      epic: { value: epic.title, sub: `${epic.tradition} · ${uniq(epic.types.map((t) => t.split(' ')[0]!)).join(', ')}` },
      episode: { value: episode.name },
      place: { value: place.name, sub: place.modern, badge: place.status },
      lens: { value: lens.name },
    },
    primary: epic.id,
    combo: combo(),
    summary: `${epic.title} · ${place.name}`,
    rules: ctx.rules,
    meta: { tradition: epic.tradition, types: epic.types },
  }
}

/* ---------- OCW Desk ---------- */

/** The course record the pool's file fields give; spins.ts enriches it with the course page afterwards. */
export function ocwCourseFromFile(f: OcwFile): OcwCourse {
  return {
    id: f.courseId,
    readableId: f.courseReadableId,
    number: f.courseNumber,
    title: f.courseTitle,
    url: `https://ocw.mit.edu/${f.courseSlug.replace(/^\/+|\/+$/g, '')}/`,
    slug: f.courseSlug,
    departments: f.departments,
    year: f.year,
    semester: f.semester,
    instructors: [],
    level: [],
    courseFeatures: [],
  }
}

function lastOcw(ctx: Ctx): { entry: SpinHistoryEntry; picks: OcwPicks } | null {
  const entry = ctx.kept[ctx.kept.length - 1]
  const picks = entry?.picks as Partial<OcwPicks> | undefined
  return entry && picks && typeof picks.fileId === 'number' && typeof picks.courseId === 'number' ? { entry, picks: picks as OcwPicks } : null
}

/**
 * Stage one: the reels the dataset fills, and the pool query. Deterministic
 * for a seed, and run twice per spin (planOcw, then draw) with the same rng
 * sequence, so the pool spins.ts fetched is the one the draw expects.
 */
function ocwPlan(ctx: Ctx, data: OcwDataset, prev: OcwPicks | undefined, sequence: boolean): OcwPlan {
  const { rng } = ctx
  const fieldById = (id: number) => data.fields.find((f) => f.id === id)
  const topicById = (id: number) => data.topics.find((t) => t.id === id)
  const kindByName = (name: string) => data.kinds.find((k) => k.name === name)
  const lensByName = (name: string) => data.lenses.find((l) => l.name === name)
  const last = ctx.kept[ctx.kept.length - 1]

  // Sequence mode: stay in the previous spin's course and walk to its next file of that kind.
  if (sequence && !ctx.locked('course')) {
    const from = lastOcw(ctx)
    const topic = from ? topicById(from.picks.topic) : undefined
    const field = topic ? fieldById(topic.field) : undefined
    const kind = from ? kindByName(from.picks.kind) : undefined
    if (from && topic && field && kind) {
      const lens = (ctx.locked('lens') && prev && lensByName(prev.lens)) || pick(data.lenses, rng)
      rule(ctx, 'sequence', 'good', `Sequence mode: continuing ${from.entry.primary} with its next ${kind.name.toLowerCase()} file. The 30-day course block and the balancing rules pause while a course is being followed.`)
      return {
        field,
        topic,
        kind,
        lens,
        u: rng(),
        query: { topic: topic.name, kind: kind.name, courseId: from.picks.courseId },
        keepFile: null,
        afterFile: from.picks.fileId,
      }
    }
    rule(ctx, 'sequence', 'info', 'Sequence mode needs a previous OCW Desk spin to continue from. Drawing fresh.')
  }

  // Field: uniform, re-drawn once when it repeats the last spin's (the Atlas region rule).
  let field: OcwField
  const prevField = prev ? fieldById(prev.field) : undefined
  if (ctx.locked('field') && prevField) {
    field = prevField
    rule(ctx, 'lock', 'info', `Field locked to ${field.name}.`)
  } else {
    field = pick(data.fields, rng)
    if (last?.meta.field === field.id && data.fields.length > 1) {
      const again = pick(data.fields, rng)
      rule(
        ctx,
        'balance',
        'warn',
        again === field
          ? `${field.name} came up twice in a row, so the field was re-drawn once and landed on it again. One re-draw is the rule, so it stands.`
          : `${field.name} came up twice in a row, so the field was re-drawn once, now ${again.name}.`,
      )
      field = again
    }
  }

  // Topic: uniform inside the field, minus topics spun in the last 30 days.
  let topic: OcwTopic
  const inField = data.topics.filter((t) => t.field === field.id)
  if (!inField.length) throw new Error(`The OCW taxonomy has no topics under ${field.name}. Re-run scripts/randomizer/ocw-taxonomy.mts.`)
  const prevTopic = prev ? topicById(prev.topic) : undefined
  if (ctx.locked('topic') && prevTopic && prevTopic.field === field.id) {
    topic = prevTopic
    rule(ctx, 'lock', 'info', `Topic locked to ${topic.name}.`)
  } else {
    const r30 = new Set(ctx.kept.filter((e) => ctx.within(e, DRAW_RULES.primaryBlockDays)).map((e) => e.meta.topic))
    const blocked = inField.filter((t) => r30.has(t.id))
    const cands = inField.filter((t) => !r30.has(t.id))
    if (blocked.length) {
      rule(
        ctx,
        '30 days',
        cands.length ? 'block' : 'warn',
        cands.length
          ? `Left out ${list(blocked.map((t) => t.name))}: spun in the last 30 days.`
          : `Every ${field.name} topic was spun in the last 30 days, so the block is lifted for this draw.`,
      )
    }
    topic = pick(cands.length ? cands : inField, rng)
    rule(ctx, 'balance', 'good', `Field first (${field.name}, 1 in ${data.fields.length}), then a topic inside it (${topic.name}, 1 in ${cands.length || inField.length}).`)
  }

  // Kind: uniform, with the one-in-three hands-on quota.
  let kind: OcwKind
  const prevKind = prev ? kindByName(prev.kind) : undefined
  if (ctx.locked('kind') && prevKind) {
    kind = prevKind
    rule(ctx, 'lock', 'info', `Resource kind locked to ${kind.name}.`)
  } else {
    let pool = data.kinds
    const lastTwo = ctx.kept.slice(-2)
    if (lastTwo.length === 2 && lastTwo.every((e) => !isHandsOn(e.meta.kind, data)) && data.kinds.some((k) => k.hands_on)) {
      pool = data.kinds.filter((k) => k.hands_on)
      rule(ctx, 'quota', 'warn', 'The last two spins were reading kinds. To keep one in three hands-on, this draw only uses problem sets, exams and projects.')
    }
    kind = pick(pool, rng)
  }

  const lens = (ctx.locked('lens') && prev && lensByName(prev.lens)) || pick(data.lenses, rng)
  const u = rng()

  // A course or resource lock narrows the pool to that course's files of the kind.
  const keepCourse = ctx.locked('course') && prev ? prev.courseId : null
  const keepFile = ctx.locked('resource') && prev ? prev.fileId : null
  if (keepCourse !== null) rule(ctx, 'lock', 'info', keepFile !== null ? 'Resource locked: the spin keeps its course and file.' : 'Course locked: the resource is drawn from its files of the chosen kind.')

  return {
    field,
    topic,
    kind,
    lens,
    u,
    query: { topic: topic.name, kind: kind.name, courseId: keepCourse },
    keepFile,
    afterFile: null,
  }
}

function sameQuery(a: OcwPool['query'], b: OcwPool['query']): boolean {
  return a.topic === b.topic && a.kind === b.kind && (a.courseId ?? null) === (b.courseId ?? null)
}

function drawOcw(ctx: Ctx, data: OcwDataset, prev: OcwPicks | undefined, pool: OcwPool | null, sequence: boolean): DrawResult {
  const { rng } = ctx
  const plan = ocwPlan(ctx, data, prev, sequence)
  if (!pool) throw new Error('The OCW Desk draws from a pool of OCW files (planOcw, then loadOcwPool), and none was given.')
  if (!sameQuery(pool.query, plan.query)) {
    throw new Error(
      `The OCW pool (${pool.query.topic} · ${pool.query.kind}${pool.query.courseId ? ` · course ${pool.query.courseId}` : ''}) is not the one the plan asked for (${plan.query.topic} · ${plan.query.kind}${plan.query.courseId ? ` · course ${plan.query.courseId}` : ''}). Same seed, same history, same locks: load the pool from planOcw() of this draw.`,
    )
  }
  const { field, topic, kind, lens: plannedLens } = plan
  let lens: NamedOption = plannedLens
  const files = pool.files.filter((f) => f.kinds.includes(kind.name))
  if (!files.length) {
    throw new Error(`No ${kind.name.toLowerCase()} files on OCW for ${topic.name}${pool.query.courseId ? ' in this course' : ''}. Re-spin: the next plan draws another topic or kind.`)
  }
  const byKey = (a: OcwFile, b: OcwFile) => a.key.localeCompare(b.key) || a.id - b.id
  const label = (f: OcwFile) => `${f.courseNumber} ${f.courseTitle}`
  const spunFiles = new Set(ctx.kept.map((e) => (e.picks as Partial<OcwPicks>).fileId).filter((id): id is number => typeof id === 'number'))

  let file: OcwFile | undefined
  let continued = false
  if (plan.afterFile !== null) {
    // Sequence mode: the next file in key order after the previous spin's; past the end, the first one not yet spun.
    const sorted = [...files].sort(byKey)
    const at = sorted.findIndex((f) => f.id === plan.afterFile)
    const next = at >= 0 ? sorted[at + 1] : undefined
    if (next) {
      file = next
      continued = true
      rule(ctx, 'sequence', 'good', `Next in ${label(file)}: ${file.title} (${at + 2} of ${sorted.length} ${kind.name.toLowerCase()} files).`)
    } else {
      const unseen = sorted.filter((f) => !spunFiles.has(f.id))
      file = unseen[0] ?? sorted[0]!
      continued = !!unseen.length
      rule(
        ctx,
        'sequence',
        unseen.length ? 'info' : 'warn',
        unseen.length
          ? `${at >= 0 ? 'The previous file was the last in key order' : 'The previous file is no longer in the course'}, so this is the first ${kind.name.toLowerCase()} file not yet spun: ${file.title}.`
          : `Every ${kind.name.toLowerCase()} file in ${label(file)} has been spun. Turn sequence mode off for a fresh course; this spin repeats the first.`,
      )
    }
  } else if (plan.keepFile !== null) {
    file = files.find((f) => f.id === plan.keepFile)
    if (file) rule(ctx, 'lock', 'info', `Resource locked to ${file.title}.`)
    else rule(ctx, 'lock', 'warn', 'The locked resource is not in the pool any more (OCW changed, or its kind did). Drawing another file from the course.')
  }

  if (!file) {
    // The 30-day block on courses (unless the course is locked), and never a file already spun.
    const r30 = new Set(ctx.kept.filter((e) => ctx.within(e, DRAW_RULES.primaryBlockDays)).map((e) => e.primary))
    const keepCourse = plan.query.courseId !== null
    const fresh = files.filter((f) => !spunFiles.has(f.id))
    const unblocked = keepCourse ? fresh : fresh.filter((f) => !r30.has(f.courseReadableId))
    const open = unblocked.length ? unblocked : null
    const blockedCourses = uniq(files.filter((f) => r30.has(f.courseReadableId)).map(label))
    if (!keepCourse && blockedCourses.length) {
      rule(
        ctx,
        '30 days',
        open ? 'block' : 'warn',
        open
          ? `Left out ${list(blockedCourses)}: spun in the last 30 days.`
          : `Every course on this page was spun in the last 30 days, so the block is lifted for this draw.`,
      )
    }
    const cands = open ?? (fresh.length ? fresh : files)
    if (!open && !fresh.length) rule(ctx, '30 days', 'warn', 'Every file on this page has been spun before. One repeats; re-spin for another page.')
    file = pick(cands, rng)
  }

  // 90-day block on the full combination: re-draw the lens, then (if free) the file.
  const combo = () => `${topic.id}|${kind.name}|${file!.courseReadableId}|${lens.name}`
  const r90 = recent(ctx, DRAW_RULES.comboBlockDays, 'combo')
  if (r90.has(combo())) {
    let tries = 0
    const others = files.filter((f) => f.courseId !== file!.courseId && !spunFiles.has(f.id))
    while (r90.has(combo()) && tries < 16) {
      tries++
      if (!ctx.locked('lens')) lens = pick(data.lenses, rng)
      else if (!ctx.locked('course') && !continued && others.length) file = pick(others, rng)
      else break
    }
    rule(
      ctx,
      '90 days',
      r90.has(combo()) ? 'warn' : 'block',
      r90.has(combo())
        ? `${label(file)} with the ${lens.name} lens ran in the last 90 days, and the reels that could change are locked. It repeats.`
        : `The first draw repeated a course and lens from the last 90 days. Re-drawn.`,
    )
  }

  const siblings = files
    .filter((f) => f.courseId === file!.courseId && f.id !== file!.id)
    .sort(byKey)
    .slice(0, DRAW_RULES.maxOcwSiblings)
  const course = ocwCourseFromFile(file)
  const pageCourses = uniq(files.map((f) => f.courseId)).length
  rule(
    ctx,
    'pool',
    'info',
    pool.query.courseId
      ? `${label(file)} has ${pool.count} ${kind.name.toLowerCase()} ${pool.count === 1 ? 'file' : 'files'} on OCW, read ${pool.asOf.slice(0, 10)}.`
      : `${topic.name} · ${kind.name}: ${pool.count.toLocaleString('en-US')} files on OCW; this page starts at ${pool.offset.toLocaleString('en-US')} (${files.length} files from ${pageCourses} ${pageCourses === 1 ? 'course' : 'courses'}), read ${pool.asOf.slice(0, 10)}.`,
  )
  rule(ctx, 'read first', 'info', `Mandatory next step: read ${file.title} at ${file.url} end to end, then the course page, and apply the ${lens.name} lens to the resource, not to the course or the field.`)
  rule(ctx, 'licence', 'info', 'OCW is CC BY-NC-SA 4.0: credit the course, its instructors and the term with a link to the course page, and no sponsored placement on the page.')

  const picks: OcwPicks = { field: field.id, topic: topic.id, kind: kind.name, lens: lens.name, courseId: file.courseId, fileId: file.id }
  const term = [file.semester, file.year].filter(Boolean).join(' ')
  const { files: _files, ...poolMeta } = pool
  return {
    randomizer: 'ocw',
    picks,
    subject: {
      randomizer: 'ocw',
      field,
      topic,
      kind,
      lens,
      course,
      file,
      siblings,
      pool: { ...poolMeta, pageSize: pool.files.length },
      sequence: continued,
    },
    reels: {
      field: { value: field.name },
      topic: { value: topic.name },
      kind: { value: kind.name, sub: kind.hands_on ? 'hands-on' : 'reading' },
      course: { value: course.title, sub: [course.number, term].filter(Boolean).join(' · ') },
      resource: { value: file.title, sub: `${file.contentType}${siblings.length ? ` · ${siblings.length + 1} ${kind.name.toLowerCase()} files in the course` : ''}` },
      lens: { value: lens.name },
    },
    primary: file.courseReadableId,
    combo: combo(),
    summary: `${course.number} ${course.title} · ${file.title}`,
    rules: ctx.rules,
    meta: { field: field.id, topic: topic.id, kind: kind.name },
  }
}

/* ---------- Footshorts ---------- */

function fixtureLine(f: FootshortsFixtureRef): string {
  const score = f.homeScore !== null && f.awayScore !== null ? ` ${f.homeScore}-${f.awayScore} ` : ' v '
  return `${f.home}${score}${f.away} (${f.kickoff.slice(0, 10)})`
}

function drawFootshorts(
  ctx: Ctx,
  data: FootshortsDataset,
  prev: FootshortsPicks | undefined,
  news: FootshortsNews | null,
  pair: boolean,
): DrawResult {
  const { rng } = ctx
  if (!news?.teams.length) {
    throw new Error('The Football Desk draws from the footshorts news snapshot, and it has no teams with fixtures. Is the fixtures sync running?')
  }
  const compNews = new Map(news.competitions.map((c) => [c.slug, c]))
  const teamBySlug = new Map(news.teams.map((t) => [t.slug, t]))
  const teamsIn = (slug: string) => news.teams.filter((t) => t.competitions.includes(slug))
  const compHeat = (c: FootshortsCompetition) => compNews.get(c.slug)?.heat ?? 0
  const minTeams = pair ? 2 : 1
  const live = data.competitions.filter((c) => teamsIn(c.slug).length >= minTeams)
  if (!live.length) throw new Error(`No tournament has ${minTeams} or more teams with fixtures in the window.`)
  const idle = data.competitions.filter((c) => !live.includes(c))
  const last = ctx.kept[ctx.kept.length - 1]
  // One branch per spin: the tournament and the team are both heat-weighted, or both pure random.
  const heatBranch = rng() < DRAW_RULES.heatShare

  let competition: FootshortsCompetition
  const prevComp = prev ? data.competitions.find((c) => c.slug === prev.competition) : undefined
  if (ctx.locked('competition') && prevComp && live.includes(prevComp)) {
    competition = prevComp
    rule(ctx, 'lock', 'info', `Tournament locked to ${competition.name}.`)
  } else {
    if (ctx.locked('competition') && prevComp) {
      rule(ctx, 'lock', 'warn', `${prevComp.name} has no teams with fixtures in the window any more, so its lock is ignored.`)
    }
    const drawComp = () =>
      heatBranch ? weighted(live, (c) => compHeat(c) + DRAW_RULES.competitionHeatFloor, rng) : pick(live, rng)
    competition = drawComp()
    if (last?.meta.competition === competition.slug && live.length > 1) {
      const again = drawComp()
      rule(
        ctx,
        'balance',
        'warn',
        again === competition
          ? `${competition.name} came up twice in a row, so the tournament was re-drawn once and landed on it again. One re-draw is the rule, so it stands.`
          : `${competition.name} came up twice in a row, so the tournament was re-drawn once, now ${again.name}.`,
      )
      competition = again
    }
    if (heatBranch) {
      const total = live.reduce((a, c) => a + compHeat(c) + DRAW_RULES.competitionHeatFloor, 0)
      const pct = Math.round(((compHeat(competition) + DRAW_RULES.competitionHeatFloor) / total) * 100)
      rule(ctx, 'weight', 'good', `Heat-weighted draw (the 60% branch). Tournament first: ${competition.name} had a ${pct}% chance among ${live.length} with fixtures, then a team inside it by its news.`)
    } else {
      rule(ctx, 'weight', 'info', `Pure random draw (the 40% branch). Tournament first (${competition.name}, 1 in ${live.length}), then a team inside it, every one equally likely.`)
    }
  }
  if (idle.length) rule(ctx, 'season', 'info', `Out of the draw: ${list(idle.map((c) => c.name))}. No teams with fixtures in the window.`)

  const inComp = teamsIn(competition.slug)
  let team: FootshortsTeamNews
  const prevTeam = prev ? teamBySlug.get(prev.team) : undefined
  if (ctx.locked('team') && prevTeam && prevTeam.competitions.includes(competition.slug)) {
    team = prevTeam
    rule(ctx, 'lock', 'info', `Team locked to ${team.name}.`)
  } else {
    const cands = eligible(ctx, inComp, {
      id: (t) => t.slug,
      name: (t) => t.name,
      heat: (t) => t.heat,
      heatLabel: 'news heat',
      everyText: `Every ${competition.name} team was spun in the last 30 days.`,
    })
    if (heatBranch) {
      team = weighted(cands, (t) => t.heat + 1, rng)
      const total = cands.reduce((a, t) => a + t.heat + 1, 0)
      rule(ctx, 'heat', 'good', `${team.name} had a ${Math.round(((team.heat + 1) / total) * 100)}% chance among ${cands.length} eligible ${competition.name} teams.`)
    } else {
      team = pick(cands, rng)
    }
  }

  const angleByName = (name: string) => data.angles.find((a) => a.name === name)
  const freshByName = (name: string) => data.freshness.find((f) => f.name === name)
  let angle = (ctx.locked('angle') && prev && angleByName(prev.angle)) || pick(data.angles, rng)
  let freshDrawn = (ctx.locked('fresh') && prev && freshByName(prev.freshDrawn)) || pick(data.freshness, rng)

  // The freshness fallback: no tagged story inside the drawn window shifts it on.
  const newest = team.headlines.map((h) => Date.parse(h.date)).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a)[0]
  const lastDev = newest === undefined ? null : Math.max(0, Math.floor((ctx.now - newest) / DAY))
  // Nothing in the snapshot means nothing in its window; past that, the agent's search decides.
  const quietFor = lastDev ?? news.windowDays + 1
  const resolve = (drawn: FootshortsFreshness): FootshortsFreshness => {
    let i = data.freshness.indexOf(drawn)
    while (i < data.freshness.length - 1 && data.freshness[i]!.days !== null && quietFor > data.freshness[i]!.days!) i++
    return data.freshness[i]!
  }
  let fresh = resolve(freshDrawn)

  // Head-to-head: prefer an opponent the team meets (or met) in the window.
  let opponent: FootshortsTeamNews | null = null
  if (pair) {
    const others = inComp.filter((t) => t.slug !== team.slug)
    const fixtures = [...team.recent, ...team.upcoming].filter((f) => f.competition === competition.slug)
    const met = new Set(fixtures.flatMap((f) => [f.homeId, f.awayId]).filter((id): id is string => !!id && id !== team.id))
    const meeting = others.filter((t) => met.has(t.id))
    if (meeting.length) {
      opponent = pick(meeting, rng)
      rule(ctx, 'pair', 'good', `Head-to-head: ${team.name} and ${opponent.name} meet in the window, so the opponent came from their fixtures. The story is the matchup.`)
    } else if (others.length) {
      opponent = pick(others, rng)
      rule(ctx, 'pair', 'info', `Head-to-head: no ${competition.name} meeting for ${team.name} in the window, so ${opponent.name} was drawn from the rest of the tournament. Compare them; don't invent a fixture.`)
    }
  }

  // 90-day block on the full combination: re-draw the reels that are free.
  const combo = () => [competition.slug, team.slug, angle.name, fresh.name, opponent?.slug].filter(Boolean).join('|')
  const r90 = recent(ctx, DRAW_RULES.comboBlockDays, 'combo')
  if (r90.has(combo())) {
    let tries = 0
    while (r90.has(combo()) && tries < 16) {
      tries++
      if (!ctx.locked('angle')) angle = pick(data.angles, rng)
      else if (!ctx.locked('fresh')) {
        freshDrawn = pick(data.freshness, rng)
        fresh = resolve(freshDrawn)
      } else break
    }
    rule(
      ctx,
      '90 days',
      r90.has(combo()) ? 'warn' : 'block',
      r90.has(combo())
        ? `${team.name} with this angle and freshness ran in the last 90 days, and the reels that could change are locked. It repeats.`
        : `The first draw repeated ${team.name}'s angle and freshness from the last 90 days. Re-drawn.`,
    )
  }

  if (fresh !== freshDrawn) {
    rule(
      ctx,
      'fallback',
      'warn',
      lastDev === null
        ? `No story tagged with ${team.name} in the last ${news.windowDays} days, so nothing in the ${freshDrawn.name} window. Shifted to ${fresh.name}; the research file says so.`
        : `No development in the ${freshDrawn.name} window (the newest tagged story is ${lastDev} days old). Shifted to ${fresh.name}; the research file says so.`,
    )
  }
  rule(
    ctx,
    'news',
    team.articles ? 'info' : 'warn',
    team.articles
      ? `${team.name}: ${team.articles} ${team.articles === 1 ? 'story' : 'stories'} tagged in the last ${news.windowDays} days (heat ${team.heat}), read ${news.asOf.slice(0, 10)}.`
      : `${team.name} has no tagged stories in the last ${news.windowDays} days. The story starts from the match record and the table, not the news.`,
  )

  // The match context the brief appends: the meetings first, then recent results and the next match.
  const h2h = opponent ? [...team.recent, ...team.upcoming].filter((f) => f.homeId === opponent!.id || f.awayId === opponent!.id) : []
  const contextFixtures = uniq(
    [...h2h, ...team.recent.slice(0, 3), ...(opponent?.recent.slice(0, 2) ?? []), ...team.upcoming.slice(0, 1)].map((f) => f.id),
  ).slice(0, DRAW_RULES.maxSpinFixtures)
  const byId = new Map([...team.recent, ...team.upcoming, ...(opponent ? [...opponent.recent, ...opponent.upcoming] : [])].map((f) => [f.id, f]))
  rule(
    ctx,
    'matches',
    contextFixtures.length ? 'info' : 'warn',
    contextFixtures.length
      ? `The brief carries match context for ${contextFixtures.length} ${contextFixtures.length === 1 ? 'fixture' : 'fixtures'}: ${contextFixtures.map((id) => fixtureLine(byId.get(id)!)).join('; ')}.`
      : `No fixtures on file for ${team.name} to attach as match context. Cite every number to a source.`,
  )
  rule(ctx, 'why now', 'info', `Mandatory next step: pull the three newest developments for ${team.name} and apply the ${angle.name} angle to the newest one.`)

  const cn = compNews.get(competition.slug)
  const next = team.upcoming[0]
  const picks: FootshortsPicks = {
    competition: competition.slug,
    team: team.slug,
    angle: angle.name,
    fresh: fresh.name,
    freshDrawn: freshDrawn.name,
    ...(opponent ? { opponent: opponent.slug } : {}),
  }
  const reels: DrawResult['reels'] = {
    competition: { value: competition.name, sub: `heat ${cn?.heat ?? 0} · ${inComp.length} teams` },
    team: { value: team.name, sub: `heat ${team.heat} · ${team.articles} ${team.articles === 1 ? 'story' : 'stories'} in ${news.windowDays}d` },
    angle: { value: angle.name },
    fresh: { value: fresh.name, sub: fresh !== freshDrawn ? `drew ${freshDrawn.name}, shifted` : fresh.window },
  }
  if (opponent) {
    const meeting = h2h[0]
    reels.pair = { value: opponent.name, sub: meeting ? fixtureLine(meeting) : `heat ${opponent.heat}` }
  } else if (next) {
    reels.team.sub = `${reels.team.sub} · next ${next.kickoff.slice(5, 10)}`
  }
  return {
    randomizer: 'footshorts',
    picks,
    subject: {
      randomizer: 'footshorts',
      competition: { ...competition, heat: cn?.heat ?? 0, articles: cn?.articles ?? 0 },
      team,
      opponent,
      angle,
      freshness: fresh,
      lastDevelopmentDays: lastDev,
      newsAsOf: news.asOf,
      newsWindowDays: news.windowDays,
      fixtureIds: contextFixtures,
    },
    reels,
    primary: team.slug,
    combo: combo(),
    summary: `${team.name}${opponent ? ` v ${opponent.name}` : ''} · ${angle.name}`,
    rules: ctx.rules,
    meta: { competition: competition.slug, heat: team.heat, pair: !!opponent },
  }
}

/* ---------- VizNBA ---------- */

function drawViznba(
  ctx: Ctx,
  data: ViznbaDataset,
  prev: ViznbaPicks | undefined,
  news: ViznbaNews | null,
  pair: boolean,
): DrawResult {
  const { rng } = ctx
  if (!news?.teams.length) {
    throw new Error('The NBA Desk draws from the VizNBA news snapshot, and it has no franchises. Has the roster seed (viznba-seed-roster.yml) run?')
  }
  const confNews = new Map(news.conferences.map((c) => [c.slug, c]))
  const teamById = new Map(news.teams.map((t) => [t.id, t]))
  const teamsIn = (slug: string) => news.teams.filter((t) => t.conference === slug)
  const confHeat = (c: ViznbaConference) => confNews.get(c.slug)?.heat ?? 0
  const live = data.conferences.filter((c) => teamsIn(c.slug).length > 0)
  if (!live.length) throw new Error('No conference has a franchise in the news snapshot.')
  const last = ctx.kept[ctx.kept.length - 1]
  // One branch per spin: the conference and the team are both heat-weighted, or both pure random.
  const heatBranch = rng() < DRAW_RULES.heatShare

  let conference: ViznbaConference
  const prevConf = prev ? data.conferences.find((c) => c.slug === prev.conference) : undefined
  if (ctx.locked('conference') && prevConf && live.includes(prevConf)) {
    conference = prevConf
    rule(ctx, 'lock', 'info', `Conference locked to the ${conference.name}.`)
  } else {
    const drawConf = () =>
      heatBranch ? weighted(live, (c) => confHeat(c) + DRAW_RULES.competitionHeatFloor, rng) : pick(live, rng)
    conference = drawConf()
    if (last?.meta.conference === conference.slug && live.length > 1) {
      const again = drawConf()
      rule(
        ctx,
        'balance',
        'warn',
        again === conference
          ? `The ${conference.name} came up twice in a row, so the conference was re-drawn once and landed on it again. One re-draw is the rule, so it stands.`
          : `The ${conference.name} came up twice in a row, so the conference was re-drawn once, now the ${again.name}.`,
      )
      conference = again
    }
    if (heatBranch) {
      const total = live.reduce((a, c) => a + confHeat(c) + DRAW_RULES.competitionHeatFloor, 0)
      const pct = Math.round(((confHeat(conference) + DRAW_RULES.competitionHeatFloor) / total) * 100)
      rule(ctx, 'weight', 'good', `Heat-weighted draw (the 60% branch). Conference first: the ${conference.name} had a ${pct}% chance, then a franchise inside it by its news.`)
    } else {
      rule(ctx, 'weight', 'info', `Pure random draw (the 40% branch). Conference first (the ${conference.name}, 1 in ${live.length}), then a franchise inside it, every one equally likely.`)
    }
  }

  const inConf = teamsIn(conference.slug)
  let team: ViznbaTeamNews
  const prevTeam = prev ? teamById.get(prev.team) : undefined
  if (ctx.locked('team') && prevTeam && prevTeam.conference === conference.slug) {
    team = prevTeam
    rule(ctx, 'lock', 'info', `Team locked to the ${team.name}.`)
  } else {
    const cands = eligible(ctx, inConf, {
      id: (t) => t.id,
      name: (t) => t.name,
      heat: (t) => t.heat,
      the: 'the ',
      heatLabel: 'news heat',
      everyText: `Every ${conference.name} franchise was spun in the last 30 days.`,
    })
    if (heatBranch) {
      team = weighted(cands, (t) => t.heat + 1, rng)
      const total = cands.reduce((a, t) => a + t.heat + 1, 0)
      rule(ctx, 'heat', 'good', `The ${team.name} had a ${Math.round(((team.heat + 1) / total) * 100)}% chance among ${cands.length} eligible ${conference.name} franchises.`)
    } else {
      team = pick(cands, rng)
    }
  }

  const angleByName = (name: string) => data.angles.find((a) => a.name === name)
  const freshByName = (name: string) => data.freshness.find((f) => f.name === name)
  let angle = (ctx.locked('angle') && prev && angleByName(prev.angle)) || pick(data.angles, rng)
  let freshDrawn = (ctx.locked('fresh') && prev && freshByName(prev.freshDrawn)) || pick(data.freshness, rng)

  // The freshness fallback: no tagged story inside the drawn window shifts it on.
  const newest = team.headlines.map((h) => Date.parse(h.date)).filter((t) => !Number.isNaN(t)).sort((a, b) => b - a)[0]
  const lastDev = newest === undefined ? null : Math.max(0, Math.floor((ctx.now - newest) / DAY))
  const quietFor = lastDev ?? news.windowDays + 1
  const resolve = (drawn: ViznbaFreshness): ViznbaFreshness => {
    let i = data.freshness.indexOf(drawn)
    while (i < data.freshness.length - 1 && data.freshness[i]!.days !== null && quietFor > data.freshness[i]!.days!) i++
    return data.freshness[i]!
  }
  let fresh = resolve(freshDrawn)

  // Head-to-head: prefer an opponent the team plays (or played) in the window. Every team meets every other, so it can come from either conference.
  let opponent: ViznbaTeamNews | null = null
  if (pair) {
    const others = news.teams.filter((t) => t.id !== team.id)
    const met = new Set([...team.recent, ...team.upcoming].flatMap((g) => [g.homeId, g.awayId]).filter((id): id is string => !!id && id !== team.id))
    const meeting = others.filter((t) => met.has(t.id))
    if (meeting.length) {
      opponent = pick(meeting, rng)
      rule(ctx, 'pair', 'good', `Head-to-head: the ${team.name} and the ${opponent.name} meet in the window, so the opponent came from their games. The story is the matchup.`)
    } else if (others.length) {
      opponent = pick(others, rng)
      rule(ctx, 'pair', 'info', `Head-to-head: no game for the ${team.name} on the schedule in the window, so the ${opponent.name} were drawn from the rest of the league. Compare them; don't invent a game.`)
    }
  }

  // 90-day block on the full combination: re-draw the reels that are free.
  const combo = () => [conference.slug, team.id, angle.name, fresh.name, opponent?.id].filter(Boolean).join('|')
  const r90 = recent(ctx, DRAW_RULES.comboBlockDays, 'combo')
  if (r90.has(combo())) {
    let tries = 0
    while (r90.has(combo()) && tries < 16) {
      tries++
      if (!ctx.locked('angle')) angle = pick(data.angles, rng)
      else if (!ctx.locked('fresh')) {
        freshDrawn = pick(data.freshness, rng)
        fresh = resolve(freshDrawn)
      } else break
    }
    rule(
      ctx,
      '90 days',
      r90.has(combo()) ? 'warn' : 'block',
      r90.has(combo())
        ? `The ${team.name} with this angle and freshness ran in the last 90 days, and the reels that could change are locked. It repeats.`
        : `The first draw repeated the ${team.name}'s angle and freshness from the last 90 days. Re-drawn.`,
    )
  }

  if (fresh !== freshDrawn) {
    rule(
      ctx,
      'fallback',
      'warn',
      lastDev === null
        ? `No story tagged with the ${team.name} in the last ${news.windowDays} days, so nothing in the ${freshDrawn.name} window. Shifted to ${fresh.name}; the research file says so.`
        : `No development in the ${freshDrawn.name} window (the newest tagged story is ${lastDev} days old). Shifted to ${fresh.name}; the research file says so.`,
    )
  }
  rule(
    ctx,
    'news',
    team.articles ? 'info' : 'warn',
    team.articles
      ? `The ${team.name}: ${team.articles} ${team.articles === 1 ? 'story' : 'stories'} tagged in the last ${news.windowDays} days (heat ${team.heat}), read ${news.asOf.slice(0, 10)}.`
      : `The ${team.name} have no tagged stories in the last ${news.windowDays} days. The story starts from the box scores and the standings, not the news.`,
  )
  if (!news.schedule.ok) {
    rule(ctx, 'schedule', 'warn', `ESPN's schedule could not be read (${news.schedule.error ?? 'unknown error'}), so the spin carries no games. Source every result.`)
  }

  // The games the brief appends box scores for: the meetings first, then recent results and the next game.
  const h2h = opponent ? [...team.recent, ...team.upcoming].filter((g) => g.homeId === opponent!.id || g.awayId === opponent!.id) : []
  const contextGames = uniq(
    [...h2h, ...team.recent.slice(0, 3), ...(opponent?.recent.slice(0, 2) ?? []), ...team.upcoming.slice(0, 1)].map((g) => g.id),
  ).slice(0, DRAW_RULES.maxSpinGames)
  const byId = new Map([...team.recent, ...team.upcoming, ...(opponent ? [...opponent.recent, ...opponent.upcoming] : [])].map((g) => [g.id, g]))
  if (news.schedule.ok) {
    rule(
      ctx,
      'games',
      contextGames.length ? 'info' : 'warn',
      contextGames.length
        ? `The brief carries the box score of ${contextGames.length} ${contextGames.length === 1 ? 'game' : 'games'}: ${contextGames.map((id) => gameSummary(byId.get(id)!)).join('; ')}.`
        : `No games on ESPN's schedule for the ${team.name} in the window (the off-season?). Cite every number to a source.`,
    )
  }
  rule(ctx, 'why now', 'info', `Mandatory next step: pull the three newest developments for the ${team.name} and apply the ${angle.name} angle to the newest one.`)

  const cn = confNews.get(conference.slug)
  const next = team.upcoming[0]
  const picks: ViznbaPicks = {
    conference: conference.slug,
    team: team.id,
    angle: angle.name,
    fresh: fresh.name,
    freshDrawn: freshDrawn.name,
    ...(opponent ? { opponent: opponent.id } : {}),
  }
  const reels: DrawResult['reels'] = {
    conference: { value: conference.name, sub: `heat ${cn?.heat ?? 0} · ${inConf.length} teams` },
    team: { value: team.name, sub: `heat ${team.heat} · ${team.articles} ${team.articles === 1 ? 'story' : 'stories'} in ${news.windowDays}d` },
    angle: { value: angle.name },
    fresh: { value: fresh.name, sub: fresh !== freshDrawn ? `drew ${freshDrawn.name}, shifted` : fresh.window },
  }
  if (opponent) {
    const meeting = h2h[0]
    reels.pair = { value: opponent.name, sub: meeting ? gameSummary(meeting) : `heat ${opponent.heat}` }
  } else if (next) {
    reels.team.sub = `${reels.team.sub} · next ${next.date.slice(5, 10)}`
  }
  return {
    randomizer: 'viznba',
    picks,
    subject: {
      randomizer: 'viznba',
      conference: { ...conference, heat: cn?.heat ?? 0, articles: cn?.articles ?? 0 },
      team,
      opponent,
      angle,
      freshness: fresh,
      lastDevelopmentDays: lastDev,
      newsAsOf: news.asOf,
      newsWindowDays: news.windowDays,
      gameIds: contextGames,
    },
    reels,
    primary: team.id,
    combo: combo(),
    summary: `${team.name}${opponent ? ` v ${opponent.name}` : ''} · ${angle.name}`,
    rules: ctx.rules,
    meta: { conference: conference.slug, heat: team.heat, pair: !!opponent },
  }
}
