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
 */

import { ATLAS, DESK, EPICS, epicRoute, isPhilosophical } from './datasets'
import { mulberry32, pick, uniq, weighted, type Rng } from './rng'
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
  type RandomizerId,
  type RuleFired,
  type SpinHistoryEntry,
  type SpinPicks,
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
  primaryBlockDays: 30,
  comboBlockDays: 90,
  heatStaleDays: 7,
  pairEveryDays: 7,
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
  /** Atlas: draw a second country. */
  pair?: boolean
  /** Epics: continue from the previous spin's place. */
  sequence?: boolean
  /** Desk: live heat from desk_heat, overriding the dataset's seed values. */
  heat?: DeskHeatRow[]
  /** For tests: swap a dataset. */
  datasets?: { desk?: DeskDataset; atlas?: AtlasDataset; epics?: EpicsDataset }
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

function list(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function draw(input: DrawInput): DrawResult {
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

  if (input.randomizer === 'desk') return drawDesk(ctx, input.datasets?.desk ?? DESK, prev?.picks as DeskPicks | undefined, input.heat ?? [])
  if (input.randomizer === 'atlas') return drawAtlas(ctx, input.datasets?.atlas ?? ATLAS, prev?.picks as AtlasPicks | undefined, !!input.pair)
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
    const r30 = recent(ctx, DRAW_RULES.primaryBlockDays, 'primary')
    const blocked = pool.filter((s) => r30.has(s.id))
    const exempt = blocked.filter((s) => heatOf(s) >= DRAW_RULES.heatExempt)
    const left = blocked.filter((s) => heatOf(s) < DRAW_RULES.heatExempt)
    let cands = pool.filter((s) => !r30.has(s.id) || heatOf(s) >= DRAW_RULES.heatExempt)
    if (left.length) rule(ctx, '30 days', 'block', `Left out ${list(left.map((s) => s.name))}: spun in the last 30 days.`)
    if (exempt.length) {
      rule(ctx, '30 days', 'warn', `${list(exempt.map((s) => s.name))} allowed back in despite a recent spin: heat ${DRAW_RULES.heatExempt} or above forces it.`)
    }
    if (!cands.length) {
      cands = pool
      rule(ctx, '30 days', 'warn', 'Every eligible segment was spun in the last 30 days, so the block is lifted for this draw.')
    }
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
  let lens = (ctx.locked('lens') && prev && lensByName(prev.lens)) || pick(data.lenses, rng)
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
      if (!ctx.locked('lens')) lens = pick(data.lenses, rng)
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
