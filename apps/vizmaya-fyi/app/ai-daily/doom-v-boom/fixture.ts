/**
 * Sample edition — the design mockup's data (docs/ai-data-centers-daily-
 * snapshot.html) expressed as a real DcEditionWithContent, so the page can
 * be reviewed at /ai-daily/doom-v-boom/sample before the pipeline has
 * published anything and the per-layer visualisations are exercised on
 * realistic stories. Every number below is illustrative; links go to outlet
 * home pages, not articles.
 *
 * The numeric blocks are produced by the same assembly functions the
 * composer uses, from the stories' `facts`, so this is also the assembly's
 * worked example.
 */

import {
  buildCounts,
  buildEnergy,
  buildGeo,
  buildLayerViz,
  buildTape,
  decimalYear,
  scoreMoodEvents,
  type StockName,
} from '@vismay/content-source/dcEditionAssembly'
import {
  DC_LAYER_KEYS,
  type DcEditionNeighbours,
  type DcEditionStory,
  type DcEditionSummary,
  type DcEditionWithContent,
  type DcLayerKey,
  type DcMood,
  type DcPaper,
  type DcPlace,
  type DcRegionKey,
  type DcStoryFacts,
  type DcThemeKey,
  type EditionLayer,
  type EditionMoodPoint,
  type EditionTapeTick,
  type EditionText,
} from '@vismay/content-source/dcEditionTypes'

// Planned charts for the sample: filled by scripts/ai-data-centers/sample-charts.ts
// (see sampleCharts.ts); empty until that file is generated.
import { SAMPLE_CHARTS, SAMPLE_CHART_SKIPS } from './sampleCharts'

export const SAMPLE_DATE = '2026-09-22'

const PLACES: DcPlace[] = [
  { slug: 'abilene', name: 'Abilene, TX', region: 'na', lat: 32.45, lng: -99.73, aliases: [] },
  { slug: 'n-virginia', name: 'Northern Virginia', region: 'na', lat: 39.04, lng: -77.49, aliases: [] },
  { slug: 'columbus', name: 'Columbus, OH', region: 'na', lat: 39.96, lng: -83.0, aliases: [] },
  { slug: 'boise', name: 'Boise, ID', region: 'na', lat: 43.62, lng: -116.21, aliases: [] },
  { slug: 'louisiana', name: 'Louisiana', region: 'na', lat: 32.35, lng: -91.75, aliases: [] },
  { slug: 'seoul', name: 'Seoul', region: 'ea', lat: 37.57, lng: 126.98, aliases: [] },
  { slug: 'hsinchu', name: 'Hsinchu', region: 'ea', lat: 24.8, lng: 120.97, aliases: [] },
  { slug: 'tokyo', name: 'Tokyo', region: 'ea', lat: 35.68, lng: 139.69, aliases: [] },
  { slug: 'shanghai', name: 'Shanghai', region: 'ea', lat: 31.23, lng: 121.47, aliases: [] },
  { slug: 'dublin', name: 'Dublin', region: 'eu', lat: 53.35, lng: -6.26, aliases: [] },
  { slug: 'amsterdam', name: 'Amsterdam', region: 'eu', lat: 52.37, lng: 4.9, aliases: [] },
  { slug: 'veldhoven', name: 'Veldhoven', region: 'eu', lat: 51.42, lng: 5.4, aliases: [] },
  { slug: 'jamnagar', name: 'Jamnagar', region: 'me', lat: 22.47, lng: 70.06, aliases: [] },
  { slug: 'abu-dhabi', name: 'Abu Dhabi', region: 'me', lat: 24.45, lng: 54.38, aliases: [] },
]

const STOCKS: StockName[] = [
  ['NVDA', 'NVIDIA', 'semiconductors'], ['AMD', 'Advanced Micro Devices', 'semiconductors'], ['INTC', 'Intel', 'semiconductors'],
  ['AVGO', 'Broadcom', 'semiconductors'], ['MU', 'Micron Technology', 'semiconductors'], ['2330.TW', 'TSMC', 'semiconductors'],
  ['005930.KS', 'Samsung Electronics', 'semiconductors'], ['000660.KS', 'SK hynix', 'semiconductors'], ['0981.HK', 'SMIC', 'semiconductors'],
  ['ASML.AS', 'ASML', 'semi-equipment'], ['AMAT', 'Applied Materials', 'semi-equipment'], ['LRCX', 'Lam Research', 'semi-equipment'],
  ['KLAC', 'KLA', 'semi-equipment'], ['8035.T', 'Tokyo Electron', 'semi-equipment'], ['6857.T', 'Advantest', 'semi-equipment'],
  ['MSFT', 'Microsoft', 'hyperscalers'], ['GOOGL', 'Alphabet', 'hyperscalers'], ['AMZN', 'Amazon', 'hyperscalers'],
  ['META', 'Meta Platforms', 'hyperscalers'], ['ORCL', 'Oracle', 'hyperscalers'],
  ['EQIX', 'Equinix', 'data-centers'], ['DLR', 'Digital Realty', 'data-centers'], ['VRT', 'Vertiv', 'data-centers'],
  ['SMCI', 'Super Micro Computer', 'data-centers'], ['CRWV', 'CoreWeave', 'data-centers'], ['2317.TW', 'Hon Hai (Foxconn)', 'data-centers'],
  ['9984.T', 'SoftBank Group', 'data-centers'],
].map(([ticker, name, category]) => ({ ticker, name, category }))

// [mood, theme, title, outlet, url, HH:MM, layer, place, region, tickers, energy, facts]
/** Classifier v4 tags: relevance and impact 1–5, and the event line + actors the Doom v Boom clustering reads. */
interface V4 {
  r: number
  i: number
  event?: string
  actors?: string[]
}
type Row = [DcMood, DcThemeKey, string, string, string, string, DcLayerKey, string, DcRegionKey, string[], boolean, DcStoryFacts | null, V4]

const g = (r: number, i: number, event?: string, actors?: string[]): V4 => ({ r, i, event, actors })

const f = (action: DcStoryFacts['action'], figures: DcStoryFacts['figures'] = [], horizon: DcStoryFacts['horizon'] = null): DcStoryFacts => ({ action, figures, horizon })

const ROWS: Row[] = [
  [1, 'power', 'Microsoft signs 20-year PPA tied to Ohio nuclear uprate, its largest single power deal', 'Reuters', 'https://www.reuters.com', '04:12', 'hyper', 'columbus', 'na', ['MSFT'], true, f('power-deal', [{ value: 2.5, unit: 'GW', label: 'nuclear uprate PPA' }, { value: 20, unit: 'years', label: 'PPA term' }]), g(5, 4)],
  [1, 'power', "Oracle's Abilene build adds 1.2 GW gas-plus-storage block as OpenAI demand grows", 'Bloomberg', 'https://www.bloomberg.com', '23:40', 'dc', 'abilene', 'na', ['ORCL', 'CRWV'], true, f('add', [{ value: 1200, unit: 'MW', label: 'gas-plus-storage block' }]), g(5, 4)],
  [1, 'capacity', 'CoreWeave takes another 250 MW in West Texas, its fourth expansion this year', 'DCD', 'https://www.datacenterdynamics.com', '19:05', 'dc', 'abilene', 'na', ['CRWV'], false, f('add', [{ value: 250, unit: 'MW', label: 'West Texas expansion' }]), g(5, 3)],
  [1, 'capacity', "Vertiv's liquid-cooling backlog tops $9bn; lead times unchanged", 'Reuters', 'https://www.reuters.com', '14:20', 'dc', 'columbus', 'na', ['VRT'], false, f('disclosure', [{ value: 9, unit: 'bn USD', label: 'liquid-cooling backlog' }]), g(4, 3)],
  [-1, 'permit', 'Equinix, Digital Realty warn Irish rule will push capacity to the Nordics', 'DCD', 'https://www.datacenterdynamics.com', '07:40', 'dc', 'dublin', 'eu', ['EQIX', 'DLR'], false, f('risk'), g(5, 3)],
  [-1, 'permit', "Northern Virginia's Loudoun board defers two campus rezonings to October", 'DCD', 'https://www.datacenterdynamics.com', '22:10', 'dc', 'n-virginia', 'na', ['DLR'], false, f('permit', [{ value: 2, unit: '', label: 'campus rezonings deferred' }], { from: null, to: '2026-10' }), g(5, 2)],
  [-1, 'permit', 'Amsterdam extends data-centre connection freeze to 2028', 'Reuters', 'https://www.reuters.com', '09:30', 'dc', 'amsterdam', 'eu', [], true, f('freeze', [], { from: null, to: '2028' }), g(5, 3)],
  [1, 'capacity', 'Alphabet to lease TPU capacity to two frontier labs from Q1', 'Bloomberg', 'https://www.bloomberg.com', '17:55', 'hyper', 'n-virginia', 'na', ['GOOGL'], false, f('capacity', [{ value: 2, unit: '', label: 'frontier labs' }], { from: '2027-Q1', to: null }), g(5, 3)],
  [1, 'permit', "Meta's Louisiana Hyperion clears final air-permit hurdle", 'Financial Times', 'https://www.ft.com', '15:10', 'hyper', 'louisiana', 'na', ['META'], true, f('permit'), g(5, 3)],
  [-1, 'power', 'Amazon pauses two Virginia leases pending grid-upgrade timeline', 'Bloomberg', 'https://www.bloomberg.com', '20:45', 'hyper', 'n-virginia', 'na', ['AMZN'], true, f('pause', [{ value: 2, unit: '', label: 'leases paused' }]), g(5, 3, 'Amazon pauses two Northern Virginia data center leases pending grid upgrades', ['Amazon'])],
  [1, 'memory', 'SK hynix says HBM4 capacity is fully booked through 2027', 'Nikkei Asia', 'https://asia.nikkei.com', '01:15', 'semi', 'seoul', 'ea', ['000660.KS'], false, f('capacity', [], { from: null, to: '2027' }), g(5, 4)],
  [1, 'memory', 'Micron raises guidance as HBM demand outruns Boise fab timeline', 'The Register', 'https://www.theregister.com', '21:30', 'semi', 'boise', 'na', ['MU'], false, f('disclosure', [], { from: null, to: 'FY27' }), g(4, 4)],
  [1, 'chips', "TSMC's CoWoS-L output doubles as Rubin packaging ramps in Chiayi", 'Financial Times', 'https://www.ft.com', '02:50', 'semi', 'hsinchu', 'ea', ['2330.TW', 'NVDA'], false, f('capacity', [{ value: 2, unit: '×', label: 'CoWoS-L output' }]), g(5, 4)],
  [0, 'memory', 'Memory, not wafers, now gates the Rubin ramp — an allocation model', 'SemiAnalysis', 'https://semianalysis.com', '12:00', 'semi', 'hsinchu', 'ea', ['NVDA', 'MU'], false, f('other'), g(4, 2)],
  [1, 'memory', 'Samsung wins HBM4 qualification at a second accelerator vendor', 'Nikkei Asia', 'https://asia.nikkei.com', '00:40', 'semi', 'seoul', 'ea', ['005930.KS'], false, f('capacity', [{ value: 2, unit: '', label: 'accelerator vendors qualified' }], { from: '2027-Q1', to: '2027-Q4' }), g(5, 3)],
  [1, 'chips', 'SMIC guides 5nm-class output up 40% on domestic accelerator demand', 'Reuters', 'https://www.reuters.com', '05:05', 'semi', 'shanghai', 'ea', ['0981.HK'], false, f('capacity', [{ value: 40, unit: '%', label: '5nm-class output guidance' }]), g(4, 3)],
  [1, 'equip', 'ASML sees logic customers pulling High-NA orders into 2027', 'Financial Times', 'https://www.ft.com', '06:30', 'equip', 'veldhoven', 'eu', ['ASML.AS'], false, f('pull-forward', [], { from: '2028', to: '2027' }), g(5, 3)],
  [1, 'equip', 'Tokyo Electron flags HBM stacking tools as fastest-growing line', 'Nikkei Asia', 'https://asia.nikkei.com', '03:20', 'equip', 'tokyo', 'ea', ['8035.T'], false, f('disclosure', [], { from: null, to: '2027-Q3' }), g(4, 2)],
  [-1, 'equip', 'Applied Materials warns draft China rules would hit 2027 revenue', 'Reuters', 'https://www.reuters.com', '20:15', 'equip', 'boise', 'na', ['AMAT', 'LRCX'], false, f('risk', [], { from: '2027', to: '2027-Q4' }), g(4, 3)],
  [1, 'equip', 'Advantest lifts HBM test-capacity plan for FY26', 'Nikkei Asia', 'https://asia.nikkei.com', '03:50', 'equip', 'tokyo', 'ea', ['6857.T'], false, f('disclosure', [], { from: null, to: '2027-Q1' }), g(4, 2)],
  [-1, 'permit', 'CRU proposes on-site generation requirement for new Irish data centres', 'Irish Times', 'https://www.irishtimes.com', '07:05', 'dc', 'dublin', 'eu', [], true, f('permit'), g(5, 3)],
  [1, 'capacity', 'Reliance breaks ground on 1 GW Jamnagar AI campus with captive solar', 'Economic Times', 'https://economictimes.indiatimes.com', '05:45', 'dc', 'jamnagar', 'me', [], true, f('add', [{ value: 1, unit: 'GW', label: 'Jamnagar AI campus' }, { value: 2, unit: 'GWh', label: 'captive battery' }]), g(5, 4)],
  [1, 'power', 'Abu Dhabi tenders 900 MW solar-plus-storage for AI campus', 'The National', 'https://www.thenationalnews.com', '08:00', 'hyper', 'abu-dhabi', 'me', [], true, f('power-deal', [{ value: 900, unit: 'MW', label: 'solar-plus-storage tender' }]), g(4, 3)],
  [-1, 'power', 'ERCOT large-load queue crosses 200 GW; 70% of requests are data centers', 'ERCOT', 'https://www.ercot.com', '16:00', 'dc', 'abilene', 'na', [], true, f('disclosure', [{ value: 200, unit: 'GW', label: 'ERCOT large-load queue, first time past 200' }, { value: 70, unit: '%', label: 'data-center share of requests' }]), g(5, 4)],
  [-1, 'power', 'GE Vernova, Siemens Energy quote 2029 delivery for new gas turbines as AI demand fills slots', 'Reuters', 'https://www.reuters.com', '13:25', 'hyper', 'columbus', 'na', [], true, f('risk', [{ value: 2029, unit: 'year', label: 'Earliest delivery quoted for new gas turbines by two OEMs' }]), g(5, 3)],
  [1, 'sustain', 'Google: water replenishment net-positive at 9 of 14 U.S. sites in 2026 update', 'Google Sustainability', 'https://sustainability.google', '18:30', 'hyper', 'n-virginia', 'na', ['GOOGL'], true, f('disclosure', [{ value: 9, unit: '/14', label: 'Google U.S. sites net-positive on water in the 2026 update' }]), g(3, 1)],
  // The same Amazon lease pause from two more outlets, worded their own way: the Doom v Boom reading groups all three into one event ("Bloomberg +2").
  [-1, 'power', 'Amazon halts two Northern Virginia data center leases as grid upgrades slip', 'Reuters', 'https://www.reuters.com', '21:05', 'hyper', 'n-virginia', 'na', ['AMZN'], true, f('pause', [{ value: 2, unit: '', label: 'leases paused' }]), g(5, 3, 'Amazon pauses two Northern Virginia data center leases over grid upgrade delays', ['Amazon'])],
  [-1, 'power', 'AWS puts Virginia data center leases on hold, citing Dominion grid timeline', 'CNBC', 'https://www.cnbc.com', '22:40', 'hyper', 'n-virginia', 'na', ['AMZN'], true, f('pause'), g(5, 3, 'Amazon Web Services pauses Virginia data center leases pending Dominion grid upgrades', ['Amazon Web Services', 'Dominion Energy'])],
]

function at(hhmm: string): string {
  // The window runs 21 Sep 08:15 → 22 Sep 08:15 UTC; times before the freeze belong to the 22nd.
  const [h, m] = hhmm.split(':').map(Number)
  const day = h * 60 + m < 8 * 60 + 15 ? '2026-09-22' : '2026-09-21'
  return `${day}T${hhmm}:00Z`
}

const STORIES: DcEditionStory[] = ROWS.map((r, i) => ({
  id: i + 1,
  url: r[4],
  title: r[2],
  summary: null,
  source: r[3],
  publishedAt: at(r[5]),
  topics: r[6] === 'dc' ? ['data-centers'] : r[6] === 'hyper' ? ['ai', 'data-centers'] : ['semiconductors'],
  tickers: r[9],
  layer: r[6],
  place: r[7],
  region: r[8],
  theme: r[1],
  mood: r[0],
  energy: r[10],
  facts: r[11],
  kind: 'news',
  relevance: r[12].r,
  impact: r[12].i,
  event: r[12].event ?? null,
  actors: r[12].actors ?? [],
}))

const IEA_STORIES: DcEditionStory[] = [
  {
    id: 101,
    url: 'https://www.iea.org',
    title: 'IEA: data centre electricity demand tracking 2026 base case, upside risk from Gulf and India',
    summary: null,
    source: 'IEA',
    publishedAt: at('09:00'),
    topics: ['electricity'],
    tickers: [],
    layer: 'dc',
    place: 'abu-dhabi',
    region: 'me',
    theme: 'sustain',
    mood: 0,
    energy: true,
    facts: null,
    kind: 'iea',
  },
]

const paper = (
  arxivId: string, category: string, date: string, area: DcPaper['area'], title: string, authors: string, affiliations: string,
  kind: DcPaper['kind'], bench: string, baseline: number, result: number, unit: string, computeBucket: number, scale: string,
  weights: boolean, code: boolean, why: string, tags: string[], importance: number,
): DcPaper => ({
  arxivId, title, abstract: null, authors, affiliations, kind, category, area, bench, baseline, result, unit, computeBucket, scale,
  weightsReleased: weights, codeReleased: code, why, tags, importance, relevant: true, publishedAt: `${date}T14:00:00Z`,
})

const PAPERS: DcPaper[] = [
  paper('2609.11902', 'cs.CL', '2026-09-21', 'reason', 'Latent Scratchpads: Chain-of-Thought Reasoning Without Emitting Tokens', 'Novak, Adeyemi, Sørensen', 'Google DeepMind', 'lab', 'GPQA Diamond', 71.2, 78.4, 'pts', 3, '70B-class', false, false, 'Moves the reasoning trace into a recurrent latent state, cutting inference tokens 5× at equal accuracy — the strongest evidence yet that visible chain-of-thought is a cost, not a requirement.', ['Reasoning', 'Efficiency'], 5),
  paper('2609.11877', 'cs.LG', '2026-09-21', 'arch', 'Router Distillation: Compressing 8-Expert MoEs into Dense 8B Models', 'Wang, Li, Bhattacharya', 'Tsinghua · Zhipu AI', 'mixed', 'MMLU-Pro', 62.3, 66.4, 'pts', 1, '8B dense', true, true, "Recovers 92% of a 47B-active MoE's quality in a dense 8B model by distilling routing decisions, not logits — relevant to every edge and on-prem deployment story.", ['Training', 'MoE', 'Open weights'], 4),
  paper('2609.10488', 'cs.LG', '2026-09-20', 'infer', 'Speculative Decoding Under Power Caps', 'Iyer, Bassett', 'Microsoft Research', 'lab', 'tokens / joule', 1, 2.3, '×', 1, '7B–70B', false, true, "Quantifies tokens-per-joule rather than tokens-per-second across four accelerator generations — the efficiency metric this edition's energy chapter keeps asking for.", ['Inference', 'Energy'], 4),
  paper('2609.11640', 'cs.CV', '2026-09-21', 'multi', 'VidGround-1FPS: Long-Video Temporal Grounding at One Frame per Second', 'Chen, Okonkwo, Park', 'Shanghai AI Lab · Fudan', 'academic', 'Charades-STA R@0.5', 58.1, 67.9, 'pts', 2, '13B', true, true, 'Handles three-hour videos at 1 FPS with a learned frame-selection policy; halves the memory footprint of the previous best long-video model.', ['Video', 'Multimodal', 'Open weights'], 3),
  paper('2609.11311', 'cs.AI', '2026-09-21', 'align', 'Deception Probes Transfer Across Model Families', 'Alvarez, Mwangi, Feldman', 'UC Berkeley · CHAI', 'academic', 'held-out AUROC', 0.74, 0.91, '', 0, 'probe on 4 families', false, true, 'A linear probe trained on one model family detects strategic deception in three others — the first cross-family transfer result for interpretability-based safety monitors.', ['Safety', 'Interpretability'], 4),
  paper('2609.11058', 'cs.SE', '2026-09-20', 'evalb', 'SWE-bench Verified Is Saturating: A Contamination Audit', 'Delgado, Rao, Whitmore', 'Stanford · Princeton', 'academic', 'tasks flagged', 0, 18, '%', 0, 'audit', false, true, 'Finds 18% of Verified tasks have fix commits in the pretraining sets of three frontier models; proposes a rolling, post-cutoff split.', ['Evaluation', 'Contamination'], 4),
  paper('2609.11842', 'cs.DC', '2026-09-21', 'infer', 'Grid-Aware Placement of LLM Inference Across Regional Carbon and Price Signals', 'Chen, Okafor, Lindqvist', 'ETH Zürich · Google DeepMind', 'mixed', 'carbon intensity', 0, -31, '%', 1, 'serving, 3 regions', false, true, 'Reports a 31% carbon-intensity cut with under 4% p99 latency cost by shifting inference between regions on 15-minute grid signals — the bridge between this chapter and the energy one.', ['Inference', 'Energy', 'Systems'], 4),
  paper('2609.11793', 'cs.AI', '2026-09-21', 'reason', 'Self-Play Curricula for Agentic Web Tasks', 'Haddad, Lin, Okoro', 'Meta FAIR', 'lab', 'WebArena', 48.2, 61.0, 'pts', 2, '70B-class', false, false, 'An agent that writes its own web tasks and grades them lifts WebArena by 13 points with no human-labelled trajectories — the largest single-paper jump on that benchmark this year.', ['Agents', 'RL'], 5),
]

const MOVES: [string, number][] = [
  ['CRWV', 7.9], ['VRT', 2.2], ['SMCI', 1.6], ['9984.T', 0.7], ['2317.TW', 0.3], ['DLR', -0.8], ['EQIX', -1.1],
  ['ORCL', 3.2], ['GOOGL', 0.9], ['META', 0.6], ['MSFT', 0.4], ['AMZN', -0.3],
  ['000660.KS', 6.8], ['MU', 5.1], ['NVDA', 2.4], ['0981.HK', 1.9], ['005930.KS', 1.4], ['2330.TW', 1.1], ['AVGO', 0.2], ['AMD', -0.8], ['INTC', -1.2],
  ['6857.T', 3.1], ['8035.T', 2.7], ['LRCX', 1.8], ['KLAC', 0.5], ['ASML.AS', -0.6], ['AMAT', -1.4],
]

const CURRENCY: Record<string, string> = { '.T': 'JPY', '.TW': 'TWD', '.KS': 'KRW', '.HK': 'HKD', '.AS': 'EUR' }

const TAPE: EditionTapeTick[] = buildTape(
  MOVES.map(([ticker, changePct]) => {
    const s = STOCKS.find((x) => x.ticker === ticker)!
    const suffix = Object.keys(CURRENCY).find((k) => ticker.endsWith(k))
    return { ticker, name: s.name, category: s.category, changePct, close: 100 + Math.abs(changePct) * 10, currency: suffix ? CURRENCY[suffix] : 'USD', tradeDate: '2026-09-21' }
  }),
)

const HIST = [0.05, -0.12, -0.2, 0.08, 0.15, 0.3, 0.22, -0.05, 0.1, 0.18, 0.25, 0.12, -0.08, -0.15, 0.02, 0.2, 0.28, 0.14, 0.05, 0.1, 0.32, 0.18, 0.06, -0.1, 0.04, 0.16, 0.24, 0.2, 0.11]
// null = that edition disclosed no capacity figure at all. Two of the last six
// did, which is what the history chart is for: the gap is the finding.
const POWER_HISTORY: { date: string; label: string; gw: number | null }[] = [
  { date: '2026-09-16', label: 'Wed 16', gw: 0.6 },
  { date: '2026-09-17', label: 'Thu 17', gw: 1.1 },
  { date: '2026-09-18', label: 'Fri 18', gw: null },
  { date: '2026-09-19', label: 'Sat 19', gw: 2.3 },
  { date: '2026-09-20', label: 'Sun 20', gw: 0.4 },
  { date: '2026-09-21', label: 'Mon 21', gw: null },
]

const TEXT: EditionText = {
  headline: "Hyperscalers lock in 4.6 GW of new power as memory becomes the AI supply chain's tightest link",
  sub: "Three power deals across Texas, Ohio and the Gulf headline a day dominated by grid access. *HBM4 is sold out through 2027*, lifting SK hynix and Micron, while Europe's permitting fights spill from Dublin into Amsterdam and India's first gigawatt campus breaks ground in Jamnagar.",
  notes: [
    { metric: '4.6', unit: 'GW', label: 'power committed in three deals', text: "Power, not chips, set the day's ceiling. A 20-year nuclear uprate PPA in Ohio, a 1.2 GW gas-plus-storage block behind Abilene, and a 900 MW solar-plus-BESS tender in Abu Dhabi — all three name interconnection timing as the binding constraint.", sources: [{ name: 'Reuters', url: 'https://www.reuters.com' }, { name: 'Bloomberg', url: 'https://www.bloomberg.com' }, { name: 'The National', url: 'https://www.thenationalnews.com' }], energy: false },
    { metric: '2027', unit: null, label: 'HBM4 booked out through', text: 'HBM4 is the new allocation fight. SK hynix says its HBM4 line is full through 2027; Micron raised guidance on the same demand and both closed up more than 5%. The Rubin bottleneck has moved from wafers to memory and packaging.', sources: [{ name: 'Nikkei Asia', url: 'https://asia.nikkei.com' }, { name: 'The Register', url: 'https://www.theregister.com' }, { name: 'SemiAnalysis', url: 'https://semianalysis.com' }], energy: false },
    { metric: 'High-NA', unit: null, label: 'orders pulled into 2027', text: 'Toolmakers are pricing a 2027 cliff. ASML sees logic customers pulling High-NA EUV forward; Tokyo Electron and Lam cite HBM stacking tools as the fastest-growing line. Applied Materials warned again on the draft China rules.', sources: [{ name: 'Financial Times', url: 'https://www.ft.com' }, { name: 'Reuters', url: 'https://www.reuters.com' }], energy: false },
    { metric: '2028', unit: null, label: "Amsterdam's connection freeze now runs to", text: "Europe's permitting fight has a second front. Ireland's regulator proposed an on-site generation rule a day after Amsterdam extended its freeze. Equinix and Digital Realty say capacity moves to the Nordics and Iberia.", sources: [{ name: 'Irish Times', url: 'https://www.irishtimes.com' }, { name: 'DCD', url: 'https://www.datacenterdynamics.com' }], energy: false },
    { metric: '1', unit: 'GW', label: 'Jamnagar campus breaks ground', text: "India and the Gulf are now on the same map as Virginia. Reliance's Jamnagar campus pairs 1 GW of load with captive solar and a 2 GWh battery; Abu Dhabi's tender is the Gulf's largest single-site AI power procurement to date.", sources: [{ name: 'Economic Times', url: 'https://economictimes.indiatimes.com' }, { name: 'The National', url: 'https://www.thenationalnews.com' }], energy: false },
    { metric: '200', unit: 'GW', label: 'ERCOT large-load queue, first time past', text: "The sustainability ledger moved both ways. Google's water update is net-positive at 9 of 14 U.S. sites, but ERCOT's queue crossed 200 GW and gas-turbine lead times stretched to 2029 — near-term additions are almost entirely fossil-backed.", sources: [{ name: 'Google Sustainability', url: 'https://sustainability.google' }, { name: 'ERCOT', url: 'https://www.ercot.com' }, { name: 'IEA', url: 'https://www.iea.org' }], energy: true },
  ],
  layers: {
    dc: {
      headline: "Texas keeps absorbing capacity while Europe's freezes harden",
      sub: 'Abilene added 1.45 GW across two announcements; Dublin and Amsterdam moved the other way, and the operators said so on the record.',
      notes: [
        { text: "Oracle's 1.2 GW block and CoreWeave's 250 MW land in the same West Texas node, now the single largest concentration in the epic.", sources: [{ name: 'Bloomberg', url: 'https://www.bloomberg.com' }, { name: 'DCD', url: 'https://www.datacenterdynamics.com' }] },
        { text: 'Equinix and Digital Realty both told investors the Irish on-site generation rule pushes new builds to the Nordics and Iberia.', sources: [{ name: 'DCD', url: 'https://www.datacenterdynamics.com' }] },
        { text: "Vertiv's liquid-cooling backlog passed $9bn with lead times flat — cooling supply is not the constraint this quarter.", sources: [{ name: 'Reuters', url: 'https://www.reuters.com' }] },
      ],
    },
    hyper: {
      headline: "Microsoft's nuclear PPA resets the bar for firm power",
      sub: 'A 20-year uprate deal in Ohio is the largest single power contract in the feed; Alphabet and Meta made capacity news of their own.',
      notes: [
        { text: 'The Ohio PPA is tied to an uprate, not a new plant — firm capacity without a 2030s construction timeline.', sources: [{ name: 'Reuters', url: 'https://www.reuters.com' }] },
        { text: 'Alphabet will lease TPU capacity to two frontier labs from Q1, its first external capacity deal at this scale.', sources: [{ name: 'Bloomberg', url: 'https://www.bloomberg.com' }] },
        { text: 'Amazon paused two Virginia leases pending a grid-upgrade timeline — the first hyperscaler pause attributed to interconnection.', sources: [{ name: 'Bloomberg', url: 'https://www.bloomberg.com' }] },
      ],
    },
    semi: {
      headline: 'HBM4 is sold out through 2027, and the market repriced memory in a day',
      sub: "SK hynix and Micron both confirmed the allocation squeeze; TSMC's packaging ramp says the Rubin bottleneck has moved from wafers to memory.",
      notes: [
        { text: 'SK hynix: HBM4 fully booked through 2027. Micron raised guidance on the same demand. Both closed up more than 5%.', sources: [{ name: 'Nikkei Asia', url: 'https://asia.nikkei.com' }, { name: 'The Register', url: 'https://www.theregister.com' }] },
        { text: "TSMC's CoWoS-L output doubled in Chiayi — packaging is no longer the gating step for the Rubin ramp.", sources: [{ name: 'Financial Times', url: 'https://www.ft.com' }] },
        { text: "Samsung's second HBM4 qualification and SMIC's 5nm-class guidance widen the supplier set at both ends of the market.", sources: [{ name: 'Nikkei Asia', url: 'https://asia.nikkei.com' }, { name: 'Reuters', url: 'https://www.reuters.com' }] },
      ],
    },
    equip: {
      headline: 'Toolmakers see a 2027 High-NA pull-forward and an HBM stacking boom',
      sub: 'ASML, Tokyo Electron and Advantest all pointed at the same two demand curves; Applied Materials was the one to warn on export rules.',
      notes: [
        { text: "ASML's pre-close comments: logic customers are pulling High-NA EUV orders into 2027.", sources: [{ name: 'Financial Times', url: 'https://www.ft.com' }] },
        { text: 'Tokyo Electron and Advantest both cited HBM stacking and test tools as their fastest-growing lines.', sources: [{ name: 'Nikkei Asia', url: 'https://asia.nikkei.com' }] },
        { text: 'Applied Materials repeated that the draft China rules would hit 2027 revenue — the only negative guide in the layer.', sources: [{ name: 'Reuters', url: 'https://www.reuters.com' }] },
      ],
    },
  },
  research: {
    headline: "Reasoning gets cheaper twice over, while the benchmark it's measured on comes under audit",
    sub: "DeepMind's latent scratchpads and Meta's self-play agents post the day's two largest gains, both closed. The open releases are smaller and denser — an 8B distilled MoE, a 13B long-video model — and a Stanford–Princeton audit says 18% of SWE-bench Verified is contaminated.",
  },
}

function build(): DcEditionWithContent {
  const placeMap = new Map(PLACES.map((p) => [p.slug, p]))
  const stockMap = new Map(STOCKS.map((s) => [s.ticker, s]))
  const today = decimalYear(SAMPLE_DATE)
  const mood = scoreMoodEvents(STORIES)
  const geo = buildGeo(STORIES, PLACES)
  const energy = buildEnergy(STORIES, IEA_STORIES, { places: placeMap, stocks: stockMap, history: POWER_HISTORY, editionDate: SAMPLE_DATE })
  const layers = {} as Record<DcLayerKey, EditionLayer>
  for (const k of DC_LAYER_KEYS) {
    layers[k] = {
      ...TEXT.layers[k],
      count: STORIES.filter((s) => s.layer === k).length,
      viz: buildLayerViz(k, STORIES, { places: placeMap, stocks: stockMap, today }),
    }
  }
  const moodSeries: EditionMoodPoint[] = HIST.map((score, i) => {
    const d = new Date(`${SAMPLE_DATE}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - (HIST.length - i))
    return { date: d.toISOString().slice(0, 10), score }
  })
  moodSeries.push({ date: SAMPLE_DATE, score: mood.score })
  const counts = buildCounts({ stories: STORIES, ieaStories: IEA_STORIES, papers: PAPERS, tape: TAPE, geo })
  return {
    id: 'sample',
    number: 114,
    date: SAMPLE_DATE,
    status: 'published',
    headline: TEXT.headline,
    sub: TEXT.sub,
    counts,
    charts: SAMPLE_CHARTS,
    chartSkips: SAMPLE_CHART_SKIPS,
    moodScore: mood.score,
    publishedAt: `${SAMPLE_DATE}T09:00:00Z`,
    windowStart: '2026-09-21T08:15:00Z',
    windowEnd: '2026-09-22T08:15:00Z',
    notes: TEXT.notes,
    moodCounts: mood.counts,
    moodSeries,
    layers,
    research: {
      headline: TEXT.research.headline,
      sub: TEXT.research.sub,
      paperIds: PAPERS.map((p) => p.arxivId),
      fieldBaseline: { reason: 2.4, arch: 1.8, infer: 1.6, multi: 1.2, align: 0.9, evalb: 0.7 },
      notice: null,
    },
    energy,
    geo,
    tape: TAPE,
    storyIds: STORIES.map((s) => s.id),
    paperIds: PAPERS.map((p) => p.arxivId),
    ieaIds: IEA_STORIES.map((s) => s.id),
    model: 'sample',
    classifierVersion: 'sample',
    composerRuns: [],
    editedFields: [],
    autoPublishAt: null,
    holdCount: 0,
    generatedAt: '2026-09-22T08:16:00Z',
    reviewedBy: null,
    stories: STORIES,
    papers: PAPERS,
    ieaStories: IEA_STORIES,
  }
}

export const SAMPLE_EDITION: DcEditionWithContent = build()

const summary = (date: string, number: number, headline: string, stories: number, papers: number, moodScore: number): DcEditionSummary => ({
  id: `sample-${date}`,
  number,
  date,
  status: 'published',
  headline,
  sub: '',
  counts: { stories, papers, tickers: 29, places: 10, energy: 6, links: stories + papers, outlets: 10 },
  moodScore,
  publishedAt: `${date}T09:00:00Z`,
})

export const SAMPLE_PREVIOUS: DcEditionSummary[] = [
  summary('2026-09-21', 113, 'Quiet Sunday: Amsterdam extends its connection freeze to 2028', 19, 2, -0.05),
  summary('2026-09-20', 112, "NVIDIA's Rubin ramp lands on packaging, not wafers", 28, 4, 0.18),
  summary('2026-09-19', 111, 'Micron and Samsung set the tone for a memory-led week', 52, 7, 0.24),
]

export const SAMPLE_NEIGHBOURS: DcEditionNeighbours = { prev: SAMPLE_PREVIOUS[0], next: null }
