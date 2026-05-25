import { LoginModal } from './LoginModal'

const LIVE = [
  { name: 'vizmaya.fyi', domain: 'geopolitics · economics · technology', partner: 'Supro' },
  { name: 'Footshorts', domain: 'football', partner: 'Supro' },
]

const IN_PRODUCTION = [
  { name: 'Kidzovo', domain: 'kids', partner: 'Open' },
  { name: 'Protrip', domain: 'travel', partner: 'Open' },
  { name: 'F1', domain: 'formula 1', partner: 'Rohit' },
  { name: 'Enterprise + Finance', domain: 'markets', partner: 'Shashank' },
]

const IN_PIPELINE = [
  { name: 'Skincare + Beauty', domain: 'beauty', partner: 'Vanshika' },
  { name: 'Fashion + Styling', domain: 'style', partner: 'Vanshika' },
  { name: 'Music & Events', domain: 'culture', partner: 'Retro Blxxd' },
]

const ON_THE_BENCH = [
  'Architecture',
  'Cricket — Sachin / Shubham',
  'Spirituality — Rohit',
  'Art',
  'Entertainment',
  'Food & recipe',
  'Science / space',
  'Pets',
  'Manufacturing in India — Padma',
]

const PIPELINE = [
  { label: 'Ingest', sub: 'scraping + tagging' },
  { label: 'Store', sub: 'supabase postgres' },
  { label: 'Author', sub: 'human instructions' },
  { label: 'Render', sub: 'the engine' },
  { label: 'Distribute', sub: 'video · pdf · social · web' },
]

const STACK = [
  'Next.js 16',
  'React 19',
  'TypeScript',
  'Supabase',
  'Mapbox GL',
  'ECharts',
  'GSAP',
  'Rive',
  'Playwright',
  'Gemini',
]

const STORIES = [
  'Currency rankings 2026',
  "Who owns America's debt",
  'Projected population 2050',
  'World Cup 2026 atlas',
  'India fuel prices',
  'South Korea GPU-hour',
  'European AI adoption',
  'Prediction markets illusion',
  'The Great Nicobar project',
  'Press freedom 2026',
]

export function LandingPage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-24">
        <Hero />
        <Manifesto />
        <Model />
        <Pipeline />
        <Engine />
        <Portfolio />
        <Proof />
        <Invitation />
      </div>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#E07A60]">
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-serif text-2xl leading-tight text-neutral-50 sm:text-3xl">
      {children}
    </h2>
  )
}

function Hero() {
  return (
    <section className="relative pb-16 sm:pb-24">
      <div className="flex items-baseline gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#E07A60]">
        <span className="font-serif text-xl font-normal normal-case tracking-normal">V.</span>
        <span>Vismay · A studio for human-built IP</span>
      </div>
      <h1 className="mt-6 font-serif text-7xl leading-none text-neutral-50 sm:text-8xl md:text-9xl">
        Vismay.
      </h1>
      <p className="mt-6 max-w-2xl font-serif text-xl italic leading-snug text-neutral-300 sm:text-2xl">
        A studio for human-built IP on a reclaimed internet. I partner with friends to build
        long-term brands around what they actually care about — and a shared engine carries the
        storytelling, the data, and the distribution.
      </p>
      <div className="mt-8 h-px w-24 bg-[#C84B31]" />
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <LoginModal label="Sign in to admin" variant="primary" />
        <a
          href="https://vizmaya.fyi"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-3 text-sm text-neutral-200 transition-colors hover:border-white/40 hover:text-white"
        >
          See it live — vizmaya.fyi
          <span aria-hidden>↗</span>
        </a>
      </div>
    </section>
  )
}

function Manifesto() {
  return (
    <section className="grid gap-10 border-t border-white/10 py-16 md:grid-cols-2">
      <div className="space-y-3">
        <Eyebrow>Why</Eyebrow>
        <SectionTitle>The internet stopped being ours.</SectionTitle>
      </div>
      <div className="space-y-4 font-serif text-base leading-relaxed text-neutral-300">
        <p>
          The internet, digital media, and distribution are owned by a handful of feudal techlords.
          Almost everything we read or watch is shaped by algorithms optimizing for something other
          than us. No platform feels truly authentic anymore.
        </p>
        <p>
          At the same time, AI is taking over the parts of work that were never the point. Which
          means the moment is right for humans to do the opposite — reconnect with what we
          actually care about and build on it, slowly, in public, with our names on it.
        </p>
        <p className="text-neutral-50">
          <em>Vismay is my answer. It&apos;s my life&apos;s work.</em>
        </p>
      </div>
    </section>
  )
}

function Model() {
  return (
    <section className="grid gap-10 border-t border-white/10 py-16 md:grid-cols-2">
      <div className="space-y-3">
        <Eyebrow>The Model</Eyebrow>
        <SectionTitle>Partner brings taste — I bring the engine.</SectionTitle>
      </div>
      <div className="space-y-6">
        <p className="font-serif text-base leading-relaxed text-neutral-300">
          I pair with a friend who has a real, durable interest in a domain — football, finance,
          F1, fashion, kids, music, travel, spirituality, food, manufacturing — and we build an IP
          together. They bring taste, voice, and obsession. I bring the engine, the production
          pipeline, and the time horizon.
        </p>
        <div className="overflow-hidden rounded-lg border border-white/10">
          <div className="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="space-y-3 p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#E07A60]">
                The partner
              </div>
              <ul className="space-y-1 text-sm text-neutral-200">
                <li>Voice, taste, obsession</li>
                <li>Editorial direction</li>
                <li>Owns the brand and the community</li>
              </ul>
            </div>
            <div className="space-y-3 p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5A7A6B]">
                Vismay
              </div>
              <ul className="space-y-1 text-sm text-neutral-200">
                <li>Engine, ingest, render pipelines</li>
                <li>Production value of a major publication</li>
                <li>Time horizon and infrastructure</li>
              </ul>
            </div>
          </div>
        </div>
        <p className="text-sm italic text-neutral-400">
          They grow the IP. I grow with them. That&apos;s what success looks like.
        </p>
      </div>
    </section>
  )
}

function Pipeline() {
  return (
    <section className="border-t border-white/10 py-16">
      <div className="space-y-3">
        <Eyebrow>The Repeatable Process</Eyebrow>
        <SectionTitle>Same pipeline for every IP.</SectionTitle>
      </div>
      <div className="mt-8 overflow-x-auto">
        <div className="flex min-w-[640px] items-stretch gap-2 border-l-2 border-[#C84B31] bg-white/[0.03] p-4">
          {PIPELINE.map((stage, i) => (
            <div key={stage.label} className="flex flex-1 items-center gap-2">
              <div className="flex-1 rounded-md border-t-2 border-[#E07A60] bg-neutral-900 p-3 text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-100">
                  {stage.label}
                </div>
                <div className="mt-1 font-serif text-[11px] italic leading-tight text-neutral-400">
                  {stage.sub}
                </div>
              </div>
              {i < PIPELINE.length - 1 && (
                <span className="text-lg text-neutral-500" aria-hidden>
                  ›
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-4 max-w-2xl font-serif text-sm italic text-neutral-400">
        Ingest is the only thing that changes per IP. Storage, engine, and surfaces are shared
        infrastructure — partners never touch code.
      </p>
    </section>
  )
}

function Engine() {
  return (
    <section className="grid gap-10 border-t border-white/10 py-16 md:grid-cols-2">
      <div className="space-y-3">
        <Eyebrow>The Engine</Eyebrow>
        <SectionTitle>
          <code className="font-serif italic text-neutral-50">@vismay/viz-engine</code> — one
          runtime, many stories.
        </SectionTitle>
      </div>
      <div className="space-y-5">
        <p className="font-serif text-base leading-relaxed text-neutral-300">
          A registry-based runtime for scroll-driven, three-layer data stories: a persistent map
          background (Mapbox GL), a chart foreground that transitions without remounting (ECharts),
          and snap-locked text that drives both. Core modules:{' '}
          <em>map · chart · image · video · embed · rive</em>. Verticals plug in as tree-shaken
          bundles. Three render pipelines —{' '}
          <em>autoplay MP4 · story PDF · TTS audio</em> — all dispatched through GitHub Actions.
          Edit in <code className="rounded bg-white/10 px-1 py-0.5 text-sm">/admin</code> with no
          redeploys.
        </p>
        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {STACK.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-neutral-300"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function Portfolio() {
  return (
    <section className="border-t border-white/10 py-16">
      <div className="space-y-3">
        <Eyebrow>The Portfolio</Eyebrow>
        <SectionTitle>What&apos;s running, what&apos;s coming.</SectionTitle>
      </div>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        <PortfolioGroup
          label="Live"
          accent="#5D8B5C"
          items={LIVE.map((i) => (
            <PortfolioRow key={i.name} {...i} />
          ))}
        />
        <PortfolioGroup
          label="In production"
          accent="#B88830"
          items={IN_PRODUCTION.map((i) => (
            <PortfolioRow key={i.name} {...i} />
          ))}
        />
        <PortfolioGroup
          label="In pipeline"
          accent="#4F8C95"
          items={IN_PIPELINE.map((i) => (
            <PortfolioRow key={i.name} {...i} />
          ))}
        />
        <PortfolioGroup
          label="On the bench"
          accent="#B5A99C"
          items={
            <div className="font-serif text-sm leading-relaxed text-neutral-300">
              {ON_THE_BENCH.join(' · ')}
            </div>
          }
        />
      </div>
    </section>
  )
}

function PortfolioGroup({
  label,
  accent,
  items,
}: {
  label: string
  accent: string
  items: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div
        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: accent }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: accent }}
          aria-hidden
        />
        {label}
      </div>
      <div className="space-y-px">{items}</div>
    </div>
  )
}

function PortfolioRow({
  name,
  domain,
  partner,
}: {
  name: string
  domain: string
  partner: string
}) {
  const isOpen = partner.toLowerCase() === 'open'
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-white/10 py-2 last:border-b-0">
      <div className="min-w-0">
        <span className="font-serif text-base text-neutral-50">{name}</span>
        <span className="ml-2 font-serif text-sm italic text-neutral-500">{domain}</span>
      </div>
      <span
        className={`shrink-0 text-[10px] uppercase tracking-[0.15em] ${
          isOpen ? 'text-neutral-500' : 'text-[#E07A60]'
        }`}
      >
        {partner}
      </span>
    </div>
  )
}

function Proof() {
  return (
    <section className="border-t border-white/10 py-16">
      <div className="grid gap-10 md:grid-cols-2">
        <div className="space-y-3">
          <Eyebrow>Proof · vizmaya.fyi</Eyebrow>
          <SectionTitle>17+ live stories. One engine.</SectionTitle>
        </div>
        <div className="space-y-5">
          <p className="font-serif text-base leading-relaxed text-neutral-300">
            {STORIES.join(' · ')} — and more.
          </p>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-5">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5A7A6B]">
              Epics
            </div>
            <p className="mt-2 font-serif text-sm leading-relaxed text-neutral-300">
              <strong className="text-neutral-100">/energy-profile</strong> — daily IEA news
              ingest + 33-country OWID energy data.{' '}
              <strong className="text-neutral-100">/epstein</strong> — curated story set with a
              bespoke landing.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Invitation() {
  return (
    <section className="mt-8 overflow-hidden rounded-2xl bg-neutral-900 p-8 sm:p-12">
      <Eyebrow>Invitation</Eyebrow>
      <h2 className="mt-3 max-w-3xl font-serif text-3xl leading-tight text-neutral-50 sm:text-4xl">
        Friends with a real obsession. Collaborators on the engine. People who want a piece of the
        internet back.
      </h2>
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-6 border-t border-white/10 pt-6">
        <div>
          <div className="font-serif text-xl text-neutral-50">Supro</div>
          <a
            href="mailto:hello@promad.design"
            className="text-sm tracking-wide text-[#E07A60] transition-colors hover:text-[#f08e75]"
          >
            hello@promad.design
          </a>
        </div>
        <LoginModal label="Sign in to admin" variant="ghost" />
      </div>
    </section>
  )
}

export default LandingPage
