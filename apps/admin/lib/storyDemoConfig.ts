/**
 * Demo content schema — every editable surface on /demo/<client_slug>.
 *
 * Stored as YAML in `demos.content_yaml`. Same precedent as `report_yaml` /
 * `share_yaml`: text blob, parsed at read time, rendered with
 * defaults filled in for every missing field so an empty YAML still
 * produces a usable page.
 *
 * Defaults are seeded from the pitch sample at /Users/suprabhodhenki/
 * Downloads/vizmaya-pitch.jsx so a brand-new demo renders the canonical
 * Vizmaya copy until sales rewrites it.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

export type LucideIcon =
  | 'MapPin'
  | 'Film'
  | 'FileText'
  | 'Presentation'
  | 'Quote'
  | 'Mail'
  | 'ArrowRight'
  | 'ArrowUpRight'

const KNOWN_ICONS = new Set<LucideIcon>([
  'MapPin', 'Film', 'FileText', 'Presentation', 'Quote', 'Mail', 'ArrowRight', 'ArrowUpRight',
])

export interface CtaLink { label: string; href: string }

export interface HeroContent {
  brand_kicker: string
  title: { pre: string; italic: string; post: string }
  description: string
  cta_primary: CtaLink
  cta_secondary: CtaLink
  trust_strip: string[]
}

export interface DemoSectionContent {
  kicker: string
  title: string
  source_note: string
}

export interface ValueProp { stat: string; label: string }

export interface OfferingItem { icon: LucideIcon; kicker: string; title: string; detail: string }

export interface OfferingContent {
  intro_kicker: string
  intro_title: string
  intro_body: string
  items: OfferingItem[]
}

export interface ProcessStep { n: string; title: string; time: string; detail: string }

export interface ProcessContent {
  kicker: string
  title: string
  steps: ProcessStep[]
}

export interface PricingTier {
  name: string
  price: string
  cadence: string
  features: string[]
  cta: CtaLink
  featured: boolean
}

export interface PricingContent {
  kicker: string
  title: string
  tiers: PricingTier[]
}

export interface PullQuoteContent { body: string; attribution: string }

export interface CtaContent {
  kicker: string
  title: string
  description: string
  email: string
  footer: { left: string; right: string }
}

export interface DemoContent {
  hero: HeroContent
  demo_section: DemoSectionContent
  value_props: ValueProp[]
  offering: OfferingContent
  process: ProcessContent
  pricing: PricingContent
  pull_quote: PullQuoteContent
  cta: CtaContent
}

export const DEMO_CONTENT_DEFAULTS: DemoContent = {
  hero: {
    brand_kicker: 'For newsrooms with stories buried in spreadsheets',
    title: {
      pre: 'Your data has a',
      italic: 'place',
      post: 'in it. We help you tell it.',
    },
    description:
      'Vizmaya partners with newsrooms to turn geographic datasets into interactive web stories — paired with the static images, video cuts, written reports and decks your editors, social team and sales floor actually need.',
    cta_primary: { label: 'See it working', href: '#demo' },
    cta_secondary: { label: 'Book a 30-min call', href: '#contact' },
    trust_strip: [
      'Promad Design Studio',
      '10+ yrs in data viz',
      'Three.js · D3 · Mapbox',
      'Built in India',
    ],
  },
  demo_section: {
    kicker: 'A working example · Built in 6 days',
    title: 'What India reads,\nand what it doesn’t.',
    source_note:
      'Live preview of the actual story — exactly what your readers will see.',
  },
  value_props: [
    {
      stat: '3×',
      label:
        'Average dwell time on interactive maps versus static images, across newsroom benchmarks.',
    },
    {
      stat: '1 brief',
      label:
        'We deliver the interactive, the social cuts, the print stills and the report. Your team stops chasing four vendors.',
    },
    {
      stat: '21 days',
      label: 'Idea to publish. Not three months. Not a quarter. Three weeks.',
    },
  ],
  offering: {
    intro_kicker: 'The full package',
    intro_title: 'One brief.\nFour deliverables.',
    intro_body:
      'Most data viz shops ship one thing — a chart, a map, a video. But a story doesn’t live on one surface. It runs across your homepage, your Instagram, the morning meeting, the advertiser pitch. We design and produce all of it from a single source of truth.',
    items: [
      {
        icon: 'MapPin',
        kicker: 'Hero asset',
        title: 'The interactive piece',
        detail:
          'A responsive, embeddable web tool — choropleths, cartograms, scrollytelling, point-cluster maps, time-series geo. Built on your data, embedded on your site, your domain.',
      },
      {
        icon: 'Film',
        kicker: 'Built for distribution',
        title: 'Video cutdowns',
        detail:
          '60s vertical for Reels & Shorts, 30s 16:9 for YouTube, 15s teaser for X — animated from the same data, captioned, brand-matched. Ready for your social desk.',
      },
      {
        icon: 'FileText',
        kicker: 'Print + web',
        title: 'Editorial-ready stills',
        detail:
          'Print-resolution PNGs and SVGs of every map state and key chart, with and without annotations. Designed for the front page, the explainer column, the print edition.',
      },
      {
        icon: 'Presentation',
        kicker: 'For the room',
        title: 'The narrative report',
        detail:
          'A 10–14 page written analysis your reporter can quote from, plus a clean pitchdeck for your sales team to walk advertisers through. Both formats. Same story.',
      },
    ],
  },
  process: {
    kicker: 'Three weeks, end to end',
    title: 'How we work',
    steps: [
      {
        n: '01',
        title: 'Data audit',
        time: 'Day 1–2',
        detail:
          'You hand us the data. We tell you which stories are buried in it — usually three to five — and which one will land.',
      },
      {
        n: '02',
        title: 'Narrative design',
        time: 'Day 3–5',
        detail:
          'We script the piece chapter by chapter. You sign off on the angle before a single pixel is drawn.',
      },
      {
        n: '03',
        title: 'Build & visualize',
        time: 'Week 2',
        detail:
          'Interactive prototype on a staging URL, reviewed live with your editor. Iterate fast.',
      },
      {
        n: '04',
        title: 'Cutdowns & ship',
        time: 'Week 3',
        detail:
          'Video cuts, stills, report, deck — all delivered the same week the interactive goes live.',
      },
    ],
  },
  pricing: {
    kicker: 'What it costs',
    title: 'Fixed price. No surprises.',
    tiers: [
      {
        name: 'Single piece',
        price: 'On request',
        cadence: 'per story',
        features: [
          'One interactive web story',
          'Six curated share assets',
          'Two short cutdowns (9:16 + 16:9)',
          'Report + slides PDF',
        ],
        cta: { label: 'Talk to us', href: '#contact' },
        featured: false,
      },
      {
        name: 'Quarterly',
        price: 'On request',
        cadence: 'per quarter',
        features: [
          'Three stories per quarter',
          'Priority slot in the queue',
          'Brand kit reused across stories',
          'Shared dashboard for sign-off',
        ],
        cta: { label: 'Talk to us', href: '#contact' },
        featured: true,
      },
      {
        name: 'Newsroom-wide',
        price: 'Custom',
        cadence: 'annual',
        features: [
          'Unlimited stories',
          'Embedded design partner',
          'Editor + reporter onboarding',
          'Annual platform retainer',
        ],
        cta: { label: 'Talk to us', href: '#contact' },
        featured: false,
      },
    ],
  },
  pull_quote: {
    body:
      'A spreadsheet is not a story. A map is not a story. A story is what happens when the reader leans in and finds the place where they live.',
    attribution: 'Vizmaya · Editorial principle №¹1',
  },
  cta: {
    kicker: 'Next steps',
    title: 'Send us your\nmessiest dataset.',
    description:
      'The election results CSV nobody opened. The crime stats from last year’s RTI. The pollution readings from the fifteen monitoring stations. We’ll come back in five working days with three story angles and a fixed-price proposal.',
    email: 'hello@vizmaya.fyi',
    footer: {
      left: 'vizmaya.fyi · A studio inside Promad Design',
      right: 'Made in India · 2026',
    },
  },
}

function pickString(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback
}

function pickIcon(v: unknown, fallback: LucideIcon): LucideIcon {
  return typeof v === 'string' && KNOWN_ICONS.has(v as LucideIcon) ? (v as LucideIcon) : fallback
}

function pickStringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback
  const filtered = v.filter((x) => typeof x === 'string') as string[]
  return filtered.length > 0 ? filtered : fallback
}

function pickCta(v: unknown, fallback: CtaLink): CtaLink {
  if (!v || typeof v !== 'object') return fallback
  const o = v as Record<string, unknown>
  return {
    label: pickString(o.label, fallback.label),
    href: pickString(o.href, fallback.href),
  }
}

function mergeHero(input: unknown): HeroContent {
  const d = DEMO_CONTENT_DEFAULTS.hero
  if (!input || typeof input !== 'object') return d
  const o = input as Record<string, unknown>
  const t = (o.title as Record<string, unknown> | undefined) ?? {}
  return {
    brand_kicker: pickString(o.brand_kicker, d.brand_kicker),
    title: {
      pre: pickString(t.pre, d.title.pre),
      italic: pickString(t.italic, d.title.italic),
      post: pickString(t.post, d.title.post),
    },
    description: pickString(o.description, d.description),
    cta_primary: pickCta(o.cta_primary, d.cta_primary),
    cta_secondary: pickCta(o.cta_secondary, d.cta_secondary),
    trust_strip: pickStringArray(o.trust_strip, d.trust_strip),
  }
}

function mergeDemoSection(input: unknown): DemoSectionContent {
  const d = DEMO_CONTENT_DEFAULTS.demo_section
  if (!input || typeof input !== 'object') return d
  const o = input as Record<string, unknown>
  return {
    kicker: pickString(o.kicker, d.kicker),
    title: pickString(o.title, d.title),
    source_note: pickString(o.source_note, d.source_note),
  }
}

function mergeValueProps(input: unknown): ValueProp[] {
  if (!Array.isArray(input) || input.length === 0) return DEMO_CONTENT_DEFAULTS.value_props
  return input
    .filter((x) => x && typeof x === 'object')
    .map((x, i) => {
      const o = x as Record<string, unknown>
      const fallback = DEMO_CONTENT_DEFAULTS.value_props[i] ?? DEMO_CONTENT_DEFAULTS.value_props[0]
      return {
        stat: pickString(o.stat, fallback.stat),
        label: pickString(o.label, fallback.label),
      }
    })
}

function mergeOffering(input: unknown): OfferingContent {
  const d = DEMO_CONTENT_DEFAULTS.offering
  if (!input || typeof input !== 'object') return d
  const o = input as Record<string, unknown>
  const items = Array.isArray(o.items) && o.items.length > 0
    ? o.items
        .filter((x) => x && typeof x === 'object')
        .map((x, i) => {
          const item = x as Record<string, unknown>
          const fallback = d.items[i] ?? d.items[0]
          return {
            icon: pickIcon(item.icon, fallback.icon),
            kicker: pickString(item.kicker, fallback.kicker),
            title: pickString(item.title, fallback.title),
            detail: pickString(item.detail, fallback.detail),
          }
        })
    : d.items
  return {
    intro_kicker: pickString(o.intro_kicker, d.intro_kicker),
    intro_title: pickString(o.intro_title, d.intro_title),
    intro_body: pickString(o.intro_body, d.intro_body),
    items,
  }
}

function mergeProcess(input: unknown): ProcessContent {
  const d = DEMO_CONTENT_DEFAULTS.process
  if (!input || typeof input !== 'object') return d
  const o = input as Record<string, unknown>
  const steps = Array.isArray(o.steps) && o.steps.length > 0
    ? o.steps
        .filter((x) => x && typeof x === 'object')
        .map((x, i) => {
          const step = x as Record<string, unknown>
          const fallback = d.steps[i] ?? d.steps[0]
          return {
            n: pickString(step.n, fallback.n),
            title: pickString(step.title, fallback.title),
            time: pickString(step.time, fallback.time),
            detail: pickString(step.detail, fallback.detail),
          }
        })
    : d.steps
  return {
    kicker: pickString(o.kicker, d.kicker),
    title: pickString(o.title, d.title),
    steps,
  }
}

function mergePricing(input: unknown): PricingContent {
  const d = DEMO_CONTENT_DEFAULTS.pricing
  if (!input || typeof input !== 'object') return d
  const o = input as Record<string, unknown>
  const tiers = Array.isArray(o.tiers) && o.tiers.length > 0
    ? o.tiers
        .filter((x) => x && typeof x === 'object')
        .map((x, i) => {
          const tier = x as Record<string, unknown>
          const fallback = d.tiers[i] ?? d.tiers[0]
          return {
            name: pickString(tier.name, fallback.name),
            price: pickString(tier.price, fallback.price),
            cadence: pickString(tier.cadence, fallback.cadence),
            features: pickStringArray(tier.features, fallback.features),
            cta: pickCta(tier.cta, fallback.cta),
            featured: typeof tier.featured === 'boolean' ? tier.featured : fallback.featured,
          }
        })
    : d.tiers
  return {
    kicker: pickString(o.kicker, d.kicker),
    title: pickString(o.title, d.title),
    tiers,
  }
}

function mergePullQuote(input: unknown): PullQuoteContent {
  const d = DEMO_CONTENT_DEFAULTS.pull_quote
  if (!input || typeof input !== 'object') return d
  const o = input as Record<string, unknown>
  return {
    body: pickString(o.body, d.body),
    attribution: pickString(o.attribution, d.attribution),
  }
}

function mergeCta(input: unknown): CtaContent {
  const d = DEMO_CONTENT_DEFAULTS.cta
  if (!input || typeof input !== 'object') return d
  const o = input as Record<string, unknown>
  const footer = (o.footer as Record<string, unknown> | undefined) ?? {}
  return {
    kicker: pickString(o.kicker, d.kicker),
    title: pickString(o.title, d.title),
    description: pickString(o.description, d.description),
    email: pickString(o.email, d.email),
    footer: {
      left: pickString(footer.left, d.footer.left),
      right: pickString(footer.right, d.footer.right),
    },
  }
}

/**
 * Parse YAML and merge with defaults. Returns the canonical defaults
 * for null / empty / invalid input — the demo route always renders.
 */
export function parseDemoContent(yamlText: string | null | undefined): DemoContent {
  if (!yamlText || yamlText.trim().length === 0) return DEMO_CONTENT_DEFAULTS
  let parsed: unknown
  try {
    parsed = parseYaml(yamlText)
  } catch {
    return DEMO_CONTENT_DEFAULTS
  }
  if (!parsed || typeof parsed !== 'object') return DEMO_CONTENT_DEFAULTS
  const o = parsed as Record<string, unknown>
  return {
    hero: mergeHero(o.hero),
    demo_section: mergeDemoSection(o.demo_section),
    value_props: mergeValueProps(o.value_props),
    offering: mergeOffering(o.offering),
    process: mergeProcess(o.process),
    pricing: mergePricing(o.pricing),
    pull_quote: mergePullQuote(o.pull_quote),
    cta: mergeCta(o.cta),
  }
}

/** Serialize the defaults to YAML so the admin "Reset to default" can seed the editor. */
export function defaultDemoContentYaml(): string {
  return stringifyYaml(DEMO_CONTENT_DEFAULTS)
}

/** Validate YAML at write time. Returns null if OK, error message otherwise. */
export function validateDemoContentYaml(raw: string): string | null {
  if (raw.trim().length === 0) return null
  try {
    const v = parseYaml(raw)
    if (v == null || typeof v !== 'object') return 'YAML must parse to an object'
    return null
  } catch (e) {
    return `YAML parse: ${e instanceof Error ? e.message : 'unknown'}`
  }
}
