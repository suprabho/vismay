/** Template-viz floor checks (three rows, one row per subject, two columns for the matrix) and the
 *  Doom v Boom event clustering + weighting.  (run: npx tsx src/dcEditionAssembly.test.ts) */
import assert from 'node:assert/strict'
import type { DcEditionStory } from './dcEditionTypes'
import {
  type EventIdf,
  buildCapacityViz,
  buildIdf,
  buildMatrixViz,
  buildOrdersViz,
  clusterEvents,
  eventDrivers,
  eventTokens,
  eventWeight,
  MIN_VIZ_ROWS,
  scoreMoodEvents,
  subjectKey,
} from './dcEditionAssembly'

const story = (id: number, over: Partial<DcEditionStory>): DcEditionStory => ({
  id,
  url: `https://example.com/${id}`,
  title: `Story ${id}`,
  summary: null,
  source: `Outlet ${id}`,
  publishedAt: '2026-09-22T06:00:00Z',
  topics: ['data-centers'],
  tickers: [],
  layer: 'dc',
  place: null,
  region: 'na',
  theme: 'capacity',
  mood: 1,
  energy: true,
  facts: { action: 'add', figures: [], horizon: null },
  kind: 'news',
  ...over,
})
const stocks = new Map([
  ['AMZN', { ticker: 'AMZN', name: 'Amazon', category: 'hyperscalers' }],
  ['MSFT', { ticker: 'MSFT', name: 'Microsoft', category: 'hyperscalers' }],
  ['AMAT', { ticker: 'AMAT', name: 'Applied Materials', category: 'semi-equipment' }],
  ['ASML', { ticker: 'ASML', name: 'ASML', category: 'semi-equipment' }],
  ['KLAC', { ticker: 'KLAC', name: 'KLA', category: 'semi-equipment' }],
])
const places = new Map()
const site = (id: number, subject: string, mw: number, source = `Outlet ${id}`) =>
  story(id, { source, facts: { action: 'add', figures: [{ value: mw, unit: 'MW', label: 'capacity', subject, scope: 'site', status: 'committed' }], horizon: null } })

// 1. Two outlets on one site collapse to a row; two rows is no viz, three is.
{
  assert.equal(buildCapacityViz([site(1, 'BDx West Java', 640), site(2, 'BDx West Java', 640, 'Telecompaper'), site(3, 'Abilene', 1200)], places, stocks), null)
  const viz = buildCapacityViz([site(1, 'BDx West Java', 640), site(2, 'BDx West Java', 640, 'Telecompaper'), site(3, 'Abilene', 1200), site(4, 'Jamnagar', 1000)], places, stocks)
  assert.equal(viz?.rows.length, MIN_VIZ_ROWS)
  assert.equal(viz?.addedMw, 2840)
}

// 1b. Undisclosed rows never carry the ledger: three "MW undisclosed" adds plus one figure is no viz.
{
  const undisclosed = (id: number, place: string) => story(id, { place, facts: { action: 'add', figures: [], horizon: null } })
  const placesMap = new Map([['a', { slug: 'a', name: 'Alpha', region: 'na', lat: 0, lng: 0, aliases: [] }], ['b', { slug: 'b', name: 'Beta', region: 'na', lat: 0, lng: 0, aliases: [] }], ['c', { slug: 'c', name: 'Gamma', region: 'na', lat: 0, lng: 0, aliases: [] }]])
  assert.equal(buildCapacityViz([undisclosed(1, 'a'), undisclosed(2, 'b'), undisclosed(3, 'c'), site(4, 'Abilene', 1200)], placesMap as any, stocks), null)
}

// 2. The hyperscaler matrix needs two kinds of move, not one column of dots.
{
  const cap = (id: number, t: string) => story(id, { layer: 'hyper', tickers: [t], facts: { action: 'capacity', figures: [], horizon: null } })
  assert.equal(buildMatrixViz([cap(1, 'AMZN'), cap(2, 'MSFT'), story(3, { layer: 'hyper', tickers: ['AMZN'], facts: { action: 'add', figures: [], horizon: null } })], stocks), null)
  const viz = buildMatrixViz([cap(1, 'AMZN'), cap(2, 'MSFT'), story(3, { layer: 'hyper', tickers: ['AMZN'], facts: { action: 'power-deal', figures: [], horizon: null } })], stocks)
  assert.deepEqual(viz?.actions, ['Power deal', 'Capacity'])
  assert.equal(viz?.cells.length, 3)
}

// 3. Orders: one row per toolmaker (the stated window beats a bare mark), three toolmakers to draw.
{
  const win = (id: number, t: string) => story(id, { layer: 'equip', tickers: [t], facts: { action: 'pull-forward', figures: [], horizon: { from: '2028', to: '2027' } } })
  const mark = (id: number, t: string) => story(id, { layer: 'equip', tickers: [t], facts: { action: 'other', figures: [{ value: 5, unit: 'bn USD', label: 'investment' }], horizon: null } })
  assert.equal(buildOrdersViz([mark(1, 'AMAT'), win(2, 'AMAT')], stocks, 2026.7), null)
  const viz = buildOrdersViz([mark(1, 'AMAT'), win(2, 'AMAT'), mark(3, 'ASML'), mark(4, 'KLAC')], stocks, 2026.7)
  assert.equal(viz?.rows.length, 3)
  assert.equal(viz?.rows[0].label, 'Applied Materials')
  assert.equal(viz?.rows[0].style, 'pull-forward')
}

// 4. subjectKey folds spelling and corporate suffixes.
assert.equal(subjectKey('BDx Data Centres Ltd.'), subjectKey('bdx data centers'))

// ---------------------------------------------------------------------------
// Doom v Boom: one vote per event, weighted by relevance × impact × coverage

let nextId = 100
const news = (title: string, over: Partial<DcEditionStory> = {}): DcEditionStory =>
  story(++nextId, { title, url: `https://news.google.com/rss/articles/${nextId}`, source: `Outlet ${nextId}`, theme: 'permit', mood: -1, facts: { action: 'other', figures: [], horizon: null }, ...over })
const ids = (groups: DcEditionStory[][]) => groups.map((g) => g.map((s) => s.id).sort((a, b) => a - b).join('+')).sort()
const merged = (groups: DcEditionStory[][], a: DcEditionStory, b: DcEditionStory) => groups.some((g) => g.includes(a) && g.includes(b))
const fine = (label: string) => ({ action: 'risk' as const, figures: [{ value: 1, unit: 'mn USD', label, subject: null, scope: 'site' as const, status: 'committed' as const }], horizon: null })

// A realistic rest-of-window, and 30 days of history for the IDF.
const window = [
  news('TSMC raises capex guidance on AI demand', { tickers: ['TSM'], mood: 1 }),
  news('Amazon pauses two Virginia data center leases', { tickers: ['AMZN'] }),
  news('Oracle expands Abilene campus for OpenAI', { tickers: ['ORCL'], place: 'abilene', mood: 1 }),
  news('SK hynix says HBM4 is sold out through 2027', { mood: 1 }),
  news('Loudoun County defers two data center rezonings', { place: 'n-virginia' }),
  news('ASML sees customers pull High-NA orders into 2027', { tickers: ['ASML'], mood: 1 }),
  news('Arizona data center fined for noise complaints'),
]
const history = Array.from({ length: 12 }, (_, k) => window.map((s) => ({ ...s, id: s.id + 1000 * (k + 1) }))).flat()

// 5. The screenshot: three outlets, one $1M Vineland fine.
const vineland = [
  news('Vineland AI data center hit with a $1 million fine', { source: 'Inquirer.com', facts: fine('fine'), event: 'NJ DEP fines Vineland AI data center $1M over gas generators', actors: ['NJ DEP', 'Vineland AI data center'] }),
  news('NJ fines Vineland AI data center $1M over natural gas generators', { source: 'Asbury Park Press', facts: fine('fine for gas generators'), event: 'New Jersey fines Vineland AI data center $1M for gas generators', actors: ['New Jersey'] }),
  news("N.J.'s largest AI data center hit with a stunning $1M fine for pollution", { source: 'NJ.com', facts: fine('pollution fine'), event: 'New Jersey fines largest AI data center $1M for pollution', actors: ['New Jersey'] }),
]
{
  assert.deepEqual([...eventTokens("N.J.'s largest AI data center hit with a stunning $1M fine")].sort(), ['fine', 'hit', 'largest', 'nj', 'stunning', 'usd:1'])
  assert.ok(eventTokens('a $1 million fine').has('usd:1') && eventTokens('$80bn').has('usd:80000') && eventTokens('$80 billion').has('usd:80000'))
  assert.ok(eventTokens('2 GW').has('mw:2000') && eventTokens('2,000 MW').has('mw:2000') && eventTokens('a 1-GW PPA').has('mw:1000'))
  assert.ok(!eventTokens('plus $5 more').has('pl'), '"plus" is not "US$"')

  const idf = buildIdf([...history, ...window, ...vineland])
  // With the v4 event lines: one event, three outlets.
  const v4 = clusterEvents([...vineland, ...window], { idf })
  assert.equal(v4.filter((g) => g.length > 1).length, 1)
  assert.deepEqual(ids(v4.filter((g) => g.length > 1)), [vineland.map((s) => s.id).join('+')])
  // Titles only (pre-v4 rows): precision first — at most two of the three merge, nothing else does.
  const titlesOnly: DcEditionStory[] = vineland.map((s) => ({ ...s, event: null }))
  const t = clusterEvents([...titlesOnly, ...window], { idf })
  assert.ok(t.filter((g) => g.some((s) => titlesOnly.includes(s))).length <= 2)
  assert.ok(t.every((g) => g.every((s) => titlesOnly.includes(s)) || g.length === 1))

  // Scored once: one doom event carrying all three reports.
  const { score, counts, events } = scoreMoodEvents([...vineland, ...window], { idf })
  assert.equal(counts.stories?.doom, 6)
  assert.equal(counts.doom, 4)
  const ev = events.find((e) => e.ids.length === 3)!
  assert.equal(ev.outlets, 3)
  assert.equal(ev.mood, -1)
  assert.equal(ev.lead, vineland[0].id, 'equal facts: the first report leads')
  assert.ok(score != null && counts.weight != null)
  const drivers = eventDrivers(events, [...vineland, ...window], 'doom')
  assert.equal(drivers.filter((d) => d.event === ev).length, 1, 'one driver row for the event')
  assert.equal(drivers.find((d) => d.event === ev)?.others.length, 2)
}

// 6. Templated headlines about different companies stay apart.
{
  const nv = news('Nvidia shares rise 3% after earnings', { tickers: ['NVDA'], mood: 1 })
  const amd = news('AMD shares rise 3% after earnings', { tickers: ['AMD'], mood: 1 })
  const meta = news('Meta signs 1 GW PPA with Constellation', { tickers: ['META'], mood: 1, theme: 'power' })
  const goog = news('Google signs 1 GW PPA with NextEra', { tickers: ['GOOGL'], mood: 1, theme: 'power' })
  const crusoe = news('Crusoe signs 1 GW PPA', { mood: 1, theme: 'power', actors: ['Crusoe'], event: 'Crusoe signs 1 GW power purchase agreement' })
  const lambda = news('Lambda signs 1 GW PPA', { mood: 1, theme: 'power', actors: ['Lambda'], event: 'Lambda signs 1 GW power purchase agreement' })
  const today = [nv, amd, meta, goog, crusoe, lambda, ...window]
  const groups = clusterEvents(today, { idf: buildIdf([...history, ...today]) })
  assert.ok(!merged(groups, nv, amd), 'disjoint tickers')
  assert.ok(!merged(groups, meta, goog), 'disjoint tickers')
  assert.ok(!merged(groups, crusoe, lambda), 'disjoint actors')
}

// 7. The same development in different words, and syndicated copy, merge.
{
  const money = (v: number, unit: string) => ({ action: 'capacity' as const, figures: [{ value: v, unit, label: 'AI data center spend', subject: 'Microsoft', scope: 'company' as const, status: 'target' as const }], horizon: null })
  const a = news('Microsoft to spend $80bn on AI data centres this year', { tickers: ['MSFT'], mood: 1, facts: money(80, 'bn USD') })
  const b = news('Microsoft plans $80 billion AI infrastructure spend', { tickers: ['MSFT'], mood: 1, facts: money(80000, 'mn USD') })
  const c = news('Oracle expands Abilene campus for OpenAI', { tickers: ['ORCL'], place: 'abilene', mood: 1, source: 'Yahoo Finance' })
  const groups = clusterEvents([a, b, c, ...window], { idf: buildIdf([...history, ...window]) })
  assert.ok(merged(groups, a, b), '$80bn = $80 billion')
  assert.ok(merged(groups, c, window[2]), 'word-for-word syndication')
}

// 8. Deterministic: input order never changes the grouping; average-link never chains.
{
  const all = [...vineland, ...window]
  const idf = buildIdf([...history, ...all])
  const base = ids(clusterEvents(all, { idf }))
  for (let k = 0; k < 5; k++) {
    const shuffled = [...all].sort(() => (Math.sin(k * 97 + all.length) > 0 ? 1 : -1))
    assert.deepEqual(ids(clusterEvents(shuffled.reverse(), { idf })), base)
  }
  // A~B and B~C, but A shares nothing with C: no chain.
  const A = news('Vineland data center fined over gas generators')
  const B = news('Vineland data center fined over gas generators, pollution')
  const C = news('Pollution complaints mount in Cumberland County')
  const g = clusterEvents([A, B, C, ...window], { idf: buildIdf([...history, ...window, A, B, C]) })
  assert.ok(merged(g, A, B))
  assert.ok(!merged(g, A, C))
}

// 8b. The 2026-09-23 edition (real rows): rewordings of one development that
// scored 0.2–0.48 on text alone merge on a shared actor and a shared figure;
// lookalikes that share only one of the two stay apart.
{
  const usd = (value: number, unit: string, label: string, subject: string | null) =>
    ({ action: 'other' as const, figures: [{ value, unit, label, subject, scope: 'company' as const, status: 'stated' as const }], horizon: null })
  const boom = (title: string, source: string, event: string, actors: string[], over: Partial<DcEditionStory> = {}) =>
    news(title, { source, event, actors, mood: 1, ...over })
  const dimon = [
    boom('Jamie Dimon warned that AI infrastructure spending could hit $1 trillion next year', 'qz.com', 'Jamie Dimon projects AI infrastructure spending could reach $1 trillion in 2027', ['JPMorgan Chase'], { mood: 0, facts: usd(1, 'tn USD', 'AI infrastructure spending forecast', 'global AI infrastructure') }),
    boom('Jamie Dimon Expects AI Hyperscalers to Spend $1 Trillion Next Year', 'PYMNTS.com', 'Jamie Dimon forecasts $1 trillion AI hyperscaler capex next year', ['JPMorgan Chase'], { facts: usd(1, 'tn USD', 'AI hyperscaler capex forecast', 'AI hyperscalers') }),
    boom('Market Chatter: JPMorgan CEO Dimon Says Hyperscaler AI Spending may Rise to $1 Trillion', 'Yahoo Finance', 'JPMorgan CEO Dimon forecasts hyperscaler AI spending may rise to $1 trillion', ['JPMorgan'], { facts: usd(1, 'tn USD', 'hyperscaler AI spending forecast', 'global hyperscalers') }),
    boom('JPMorgan CEO Dimon Says Hyperscaler AI Spending may Rise to $1 Trillion', 'marketscreener.com', 'JPMorgan CEO projects hyperscaler AI capex may reach $1 trillion', ['JPMorgan'], { facts: usd(1, 'tn USD', 'hyperscaler AI capex projection', 'hyperscalers') }),
  ]
  const verda = [
    boom('Verda Raises $189 Million Series B To Become Europe’s Latest AI Infrastructure Unicorn', 'Pulse 2.0', 'Verda raises $189 million Series B funding round', ['Verda'], { facts: usd(189, 'mn USD', 'Series B funding', 'Verda') }),
    boom('European neocloud Verda raises $189M to build the AI infrastructure of tomorrow', 'SiliconANGLE', 'Verda raises $189M for European AI data center build-out', ['Verda'], { facts: usd(189, 'mn USD', 'funding raised', 'Verda') }),
  ]
  const nexstrom = [
    boom('Nexstrom Raises $12 Million Seed Round to Commercialize the First 12-Inch Single-Crystal 2D Semiconductor Platform', 'PR Newswire', 'Nexstrom raises $12M seed to commercialize 12-inch single-crystal 2D semiconductor platform', ['Nexstrom'], { facts: usd(12, 'mn USD', 'seed funding raised', 'Nexstrom') }),
    boom('Nexstrom Raises $12 Million Seed Funding To Commercialize 12-Inch 2D Semiconductor Wafers For AI Chips', 'Pulse 2.0', 'Nexstrom raises $12M seed funding for 12-inch 2D semiconductor wafers', ['Nexstrom'], { facts: usd(12, 'mn USD', 'seed funding', 'Nexstrom') }),
    boom("Singapore's Nexstrom raises $12M to scale 12-inch 2D semiconductor platform", 'TNGlobal', 'Nexstrom raises $12M to scale 12-inch 2D semiconductor platform', ['Nexstrom'], { place: 'singapore', facts: usd(12, 'mn USD', 'funding raised', 'Nexstrom') }),
    boom('Nexstrom bags $12M to help chipmakers replace silicon with more efficient semiconductor wafers', 'SiliconANGLE', 'Nexstrom raises $12M to develop alternative semiconductor wafer materials', ['Nexstrom'], { facts: usd(12, 'mn USD', 'funding raised', 'Nexstrom') }),
  ]
  const threeE = [
    boom('3 E Network Technology Group Limited Announces High-Capacity Green Energy Architecture for Finland AI Data Center', 'Quiver Quantitative', '3 E Network announces green energy architecture for Finland AI data center', ['3 E Network Technology Group Limited'], { place: 'oslo' }),
    boom('3 E Network Develops Multi-Megawatt Green Energy Architecture for Finnish AI Data Center', 'Stock Titan', '3 E Network develops multi-megawatt green energy architecture for Finnish AI data center', ['3 E Network'], { place: 'oslo' }),
  ]
  const lgCooling = [
    boom('LG and SK Enmove to jointly develop AI data centre cooling', 'Telecompaper', 'LG and SK Enmove jointly develop AI data centre cooling', ['LG', 'SK Enmove'], { tickers: ['000660.KS'], place: 'seoul' }),
    boom('LG Electronics, SK Enmove team up on AI data center cooling', 'The Korea Herald', 'LG Electronics and SK Enmove partner on AI data center cooling', ['LG Electronics', 'SK Enmove'], { place: 'seoul' }),
  ]
  const lgNvidia = boom('LG Wins Nvidia Certification for AI Data Center Cooling, Batteries', 'Seoul Economic Daily', 'LG wins Nvidia certification for AI data center cooling and batteries', ['LG', 'Nvidia'], { tickers: ['NVDA'], place: 'seoul' })
  const amd = boom("AMD Just Joined the $1 Trillion Club. Here's Why Investors Are Betting Big on the Chipmaker.", 'The Motley Fool', 'AMD market capitalization reaches $1 trillion', ['AMD'], { tickers: ['AMD'], facts: usd(1, 'tn USD', 'market capitalization', 'AMD') })
  const nexperia = boom('Nexperia, Tata Electronics partner across semiconductor', 'Bisinfotech', 'Nexperia and Tata Electronics form semiconductor partnership', ['Nexperia', 'Tata Electronics'])
  const gsme = boom('GSME, Teradyne form partnership for semiconductor test center', 'Investing.com', 'GSME and Teradyne form semiconductor test center partnership', ['GSME', 'Teradyne'])
  const lgBattery = boom('LG Electronics expands battery plant in Michigan', 'Wire A', 'LG Electronics expands Michigan battery plant', ['LG Electronics'])
  const tataFab = boom('Tata Electronics breaks ground on Assam fab', 'Wire B', 'Tata Electronics breaks ground on Assam semiconductor fab', ['Tata Electronics'])

  const today = [...dimon, ...verda, ...nexstrom, ...threeE, ...lgCooling, lgNvidia, amd, nexperia, gsme, lgBattery, tataFab, ...window]
  // The real IDF that day (30 days of feed, n = 4,010): these pairs sit close
  // to the line, and a toy corpus weighs every unseen word the same.
  const df: [string, number][] = [
    ['12', 9], ['2027', 55], ['2d', 8], ['across', 31], ['alternative', 6], ['amd', 70], ['announce', 41], ['architecture', 14], ['bag', 3],
    ['battery', 6], ['become', 25], ['betting', 9], ['big', 40], ['break', 31], ['build', 101], ['capacity', 67], ['capex', 21],
    ['capitalization', 7], ['ceo', 36], ['certification', 2], ['chatter', 1], ['club', 8], ['commercialize', 2], ['cooling', 42], ['crystal', 3],
    ['develop', 25], ['dimon', 6], ['efficient', 5], ['electronic', 79], ['energy', 70], ['enmove', 2], ['europe', 16], ['european', 7],
    ['expand', 161], ['expect', 3], ['fab', 94], ['finland', 62], ['finnish', 10], ['first', 48], ['forecast', 73], ['form', 13], ['funding', 34],
    ['green', 9], ['ground', 22], ['group', 29], ['gsme', 1], ['help', 9], ['here', 22], ['high', 74], ['hit', 71], ['hyperscaler', 93],
    ['inch', 6], ['investor', 76], ['jamie', 3], ['joined', 3], ['jointly', 3], ['jpmorgan', 11], ['just', 33], ['latest', 16], ['lg', 21],
    ['limited', 5], ['market', 311], ['material', 60], ['megawatt', 1], ['michigan', 10], ['multi', 18], ['neocloud', 6], ['network', 25],
    ['nexperia', 17], ['nexstrom', 5], ['next', 107], ['nvidia', 300], ['partner', 87], ['partnership', 62], ['plant', 35], ['platform', 47],
    ['project', 50], ['raise', 107], ['reach', 36], ['reache', 19], ['replace', 1], ['rise', 50], ['round', 24], ['scale', 33], ['seed', 6],
    ['sery', 22], ['silicon', 40], ['singapore', 11], ['single', 15], ['sk', 87], ['spend', 9], ['spending', 64], ['tata', 36], ['team', 21],
    ['teradyne', 14], ['test', 28], ['tomorrow', 1], ['unicorn', 1], ['usd:1000000', 20], ['usd:12', 4], ['usd:189', 4], ['verda', 2],
    ['wafer', 16], ['warned', 2], ['win', 36], ['year', 89],
  ]
  const idf: EventIdf = { n: 4010, df: new Map(df) }
  const groups = clusterEvents(today, { idf })
  const one = (members: DcEditionStory[]) => groups.some((g) => members.every((s) => g.includes(s)))
  assert.ok(one(dimon), 'Dimon $1T: "JPMorgan Chase" and "JPMorgan" reports are one event')
  assert.ok(one(verda), 'Verda: $189M = $189 million, same company')
  assert.ok(one(nexstrom), 'Nexstrom: the SiliconANGLE rewording joins the $12M seed')
  assert.ok(one(threeE), '3 E Network: company suffix in one actor name only')
  assert.ok(one(lgCooling), 'LG + SK Enmove cooling')
  assert.ok(!merged(groups, lgNvidia, lgCooling[0]), 'shared actor and topic, different development')
  assert.ok(!merged(groups, amd, dimon[0]), 'same $1 trillion, different companies')
  assert.ok(!merged(groups, nexperia, gsme), '"form partnership" with no company in common')
  assert.ok(!merged(groups, lgBattery, tataFab), '"Electronics" alone is not a shared actor')
}

// 9. Weights and the reading.
{
  // No duplicates and nothing graded: every event weighs the same, so the reading is the old count.
  const plain = [
    news('Alpha breaks ground on a campus', { mood: 1, place: 'abilene' }),
    news('Beta signs a turbine order', { mood: 1, place: 'columbus' }),
    news('Gamma pauses a lease', { mood: -1, place: 'dublin' }),
    news('Delta explainer on cooling', { mood: 0, place: 'tokyo' }),
  ]
  const r = scoreMoodEvents(plain)
  assert.equal(r.score, Math.round(((2 - 1) / 3) * 1000) / 1000)
  assert.deepEqual([r.counts.boom, r.counts.doom, r.counts.neutral], [2, 1, 1])

  // Impact decides, relevance tempers, coverage is damped.
  assert.ok(eventWeight(5, 5, 1) / eventWeight(5, 1, 1) > 6 && eventWeight(5, 5, 1) / eventWeight(5, 1, 1) < 6.5)
  const near = (a: number, b: number) => Math.abs(a - b) < 0.001
  assert.ok(near(eventWeight(1, 3, 1) / eventWeight(5, 3, 1), 0.6))
  assert.ok(near(eventWeight(5, 3, 2) / eventWeight(5, 3, 1), 1.25))
  assert.equal(eventWeight(5, 3, 64), eventWeight(5, 3, 8), 'coverage caps at 8 outlets')

  // One big boom outweighs two small dooms.
  const big = scoreMoodEvents([
    news('Hyperscaler commits 5 GW', { mood: 1, relevance: 5, impact: 5, place: 'abilene' }),
    news('Town fines a site', { mood: -1, relevance: 5, impact: 1, place: 'dublin' }),
    news('County delays a hearing', { mood: -1, relevance: 4, impact: 1, place: 'tokyo' }),
  ])
  assert.ok(big.score! > 0.5)
  assert.deepEqual([big.counts.boom, big.counts.doom], [1, 2])

  // Mixed coverage of one event: the majority wins; an even split is neutral and flagged.
  const vote = (moods: (1 | -1 | 0)[]) =>
    scoreMoodEvents(moods.map((m, k) => news('Samsung wins HBM4 qualification at Nvidia', { mood: m, tickers: ['005930.KS'], source: `Wire ${k}` }))).events
  assert.equal(vote([-1, -1, 0])[0].mood, -1)
  assert.equal(vote([1, -1])[0].mood, 0)
  assert.equal(vote([1, -1])[0].mixed, true)
  // Grades are the median of the graded members; ungraded members don't drag it to 3.
  const graded = scoreMoodEvents([
    news('Samsung wins HBM4 qualification at Nvidia', { impact: 4, relevance: 5, source: 'A' }),
    news('Samsung wins HBM4 qualification at Nvidia', { impact: 2, relevance: 5, source: 'B' }),
    news('Samsung wins HBM4 qualification at Nvidia', { source: 'C' }),
  ]).events[0]
  assert.equal(graded.ids.length, 3)
  assert.equal(graded.i, 3)
  assert.equal(graded.r, 5)
}

// 10. 150 stories cluster fast enough for 30 days of history on every compose.
{
  const heads = [...window, ...vineland].map((s) => s.title)
  const many = Array.from({ length: 150 }, (_, k) => news(`${heads[k % heads.length]} ${['north', 'south', 'east', 'west', 'central'][k % 5]} ${k}`, { mood: ((k % 3) - 1) as -1 | 0 | 1 }))
  const t0 = performance.now()
  scoreMoodEvents(many)
  assert.ok(performance.now() - t0 < 200, `took ${Math.round(performance.now() - t0)} ms`)
}

console.log('dcEditionAssembly.test: ok')
