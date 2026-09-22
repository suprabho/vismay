import Link from 'next/link'
import type { DcEditionNeighbours, DcEditionSummary, DcEditionWithContent, DcLayerKey } from '@vismay/content-source/dcEditionTypes'
import { DC_LAYER_KEYS, formatEditionDate, formatSigned, moodTone, moodWord } from '@vismay/content-source/dcEditionTypes'
import { buildCounts, deriveSources } from '@vismay/content-source/dcEditionAssembly'
import type { AiDataCentersTheme } from '../../theme'
import EditionThemeStyle from './EditionThemeStyle'
import ChapterNav from './ChapterNav'
import ShareButton from './ShareButton'
import TickerTape from './TickerTape'
import DoomBoomMeter from './DoomBoomMeter'
import KeyNotes from './KeyNotes'
import GeoMap from './GeoMap'
import LayerTile from './LayerTile'
import ResearchChapter from './ResearchChapter'
import EnergyChapter from './EnergyChapter'
import Sources from './Sources'
import PreviousEditions from './PreviousEditions'
import StoryPanel, { type PanelData } from './StoryPanel'
import { editionHref, windowLabel } from './editionUtils'

interface Props {
  edition: DcEditionWithContent
  neighbours: DcEditionNeighbours
  /** Recent published editions (may include the current one), newest first. */
  previous: DcEditionSummary[]
  themeOverrides: Partial<AiDataCentersTheme>
  siteUrl: string
  sample?: boolean
}

/**
 * The edition page: masthead, hero, tape, seven chapters, archive rail and
 * footer, rendered from one frozen edition row. Server component — the only
 * client code is the chapter scroll-spy, the share button, the canvas map and
 * the slide-over panel.
 */
export default function EditionPage({ edition: e, neighbours, previous, themeOverrides, siteUrl, sample = false }: Props) {
  const tone = moodTone(e.moodScore)
  const word = moodWord(e.moodScore).split(',')[0].replace('-leaning', '')
  const groups = deriveSources(e.stories, e.ieaStories, e.papers)
  const counts = e.counts.stories || e.counts.papers ? e.counts : buildCounts({ stories: e.stories, ieaStories: e.ieaStories, papers: e.papers, tape: e.tape, geo: e.geo })
  const stamp = `Snapshot · ${formatEditionDate(e.date, { weekday: false })} · 08:15 UTC`
  const canonical = `${siteUrl}${editionHref(e.date)}`
  const publishedLabel = e.status === 'published' ? 'frozen 08:15 UTC' : 'draft · not yet frozen'

  const panelData: PanelData = {
    stories: e.stories,
    ieaStories: e.ieaStories,
    papers: e.papers,
    geo: e.geo,
    layers: Object.fromEntries(DC_LAYER_KEYS.map((k) => [k, { headline: e.layers[k].headline, sub: e.layers[k].sub }])) as Record<DcLayerKey, { headline: string; sub: string }>,
    fieldBaseline: e.research.fieldBaseline,
    energyCount: e.energy.storyCount,
  }

  const step = (dir: 'prev' | 'next') => {
    const target = dir === 'prev' ? neighbours.prev : neighbours.next
    const path = dir === 'prev' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'
    const icon = (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={path} />
      </svg>
    )
    if (target) {
      return (
        <Link className="step" href={editionHref(target.date)} title={`${formatEditionDate(target.date)} — edition ${target.number ?? ''}`} aria-label={dir === 'prev' ? 'Previous edition' : 'Next edition'}>
          {icon}
        </Link>
      )
    }
    return (
      <button className="step" disabled title={dir === 'prev' ? 'This is the first edition' : "Tomorrow's edition is published at 09:00 UTC"} aria-label={dir === 'prev' ? 'Previous edition' : 'Next edition'}>
        {icon}
      </button>
    )
  }

  return (
    <>
      <EditionThemeStyle overrides={themeOverrides} />
      <header className="mast">
        <div className="mast-row">
          <div className="brand">
            <Link className="wordmark" href="/">
              vizmaya
            </Link>
            <Link className="epic" href="/ai-data-centers">
              AI Data Centers · Daily snapshot
            </Link>
          </div>
          <nav className="edition-nav" aria-label="Edition">
            {step('prev')}
            <a className="today" href="#previous" title="Open the edition archive">
              <b>{formatEditionDate(e.date)}</b>
              <small>
                {e.number != null ? `Edition ${e.number} · ` : ''}
                {publishedLabel}
              </small>
            </a>
            {step('next')}
          </nav>
          <div className="mast-tools">
            <a className={`pill mood ${tone}`} id="moodchip" href="#glance" title="Doom v Boom — today's reading">
              <span className="dot" />
              <span className="txt">
                {e.moodScore == null ? 'Doom v Boom' : `${word} ${formatSigned(e.moodScore)}`}
              </span>
            </a>
            <a className="pill" href="#previous">
              <span className="dot" />
              <span className="txt">Snapshot, not live</span>
            </a>
            <ShareButton url={canonical} />
          </div>
        </div>
        <ChapterNav />
      </header>

      <main id="top">
        <div className="wrap">
          <div className="hero">
            <div>
              <div className="meta eyebrow">
                <span>24 hours · {windowLabel(e.windowStart, e.windowEnd)}</span>
                <span>
                  {counts.stories} stories · {counts.papers} papers · {counts.tickers} tickers
                </span>
                {sample && <span className="sample-note">Sample edition — illustrative content</span>}
                {!sample && e.model === 'deterministic' && <span className="sample-note">Assembled without the prose model</span>}
              </div>
              <h1>{e.headline}</h1>
              <p className="deck">
                <Deck text={e.sub} />
              </p>
            </div>
          </div>
        </div>

        <TickerTape tape={e.tape} />

        <section className="chapter wrap" id="glance">
          <div className="chapter-head">
            <div>
              <h2>Doom v Boom</h2>
              <p className="lede">The day&rsquo;s mood in one reading, scored story by story. Open either side to see what pushed the needle.</p>
            </div>
            <div className="side">
              I · {e.moodCounts.boom + e.moodCounts.doom} stories scored · {e.moodSeries.length}-edition trend
            </div>
          </div>
          <div className="glance">
            <DoomBoomMeter score={e.moodScore} counts={e.moodCounts} series={e.moodSeries} stories={e.stories} />
          </div>
        </section>

        <section className="chapter wrap" id="notes">
          <div className="chapter-head">
            <div>
              <h2>Key notes</h2>
              <p className="lede">Six things to carry out of the day, each anchored on the number that matters. Every note links to the reporting it rests on.</p>
            </div>
            <div className="side">II · Key notes</div>
          </div>
          <KeyNotes notes={e.notes} />
        </section>

        <section className="chapter geo-section" id="geo">
          <div className="wrap">
            <div className="chapter-head">
              <div>
                <h2>By geography</h2>
                <p className="lede">Every story carries a geo tag from the classifier. Pins are sized by story count — hover for the place, click to read its stories.</p>
              </div>
              <div className="side">
                III · {counts.stories} stories · {counts.places} places
              </div>
            </div>
          </div>
          <div className="bleed">
            <GeoMap places={e.geo.places} regions={e.geo.regions} stamp={stamp} />
          </div>
        </section>

        <section className="chapter wrap" id="layers">
          <div className="chapter-head">
            <div>
              <h2>By AI layer</h2>
              <p className="lede">The four buckets the stock registry uses. Each tile carries its own headline, one picture of what moved in that layer today, and the notes behind it; open a tile to read the stories.</p>
            </div>
            <div className="side">IV · 4 layers · {counts.tickers} tickers</div>
          </div>
          <div className="layers" id="layers-grid">
            {DC_LAYER_KEYS.map((k) => (
              <LayerTile key={k} layerKey={k} layer={e.layers[k]} />
            ))}
          </div>
        </section>

        <section className="chapter wrap" id="papers">
          <div className="chapter-head">
            <div>
              <h2>New research</h2>
              <p className="lede">The day in AI research, on its own terms: which fields moved, how big the reported gains were and at what compute, and how much of it was released. Open a paper for the result, the scale and why it matters.</p>
            </div>
            <div className="side">
              V · {counts.papers} papers · {new Set(e.papers.map((p) => p.area).filter(Boolean)).size} fields · arXiv
            </div>
          </div>
          <ResearchChapter research={e.research} papers={e.papers} />
        </section>

        <section className="chapter wrap energy" id="energy">
          <div className="chapter-head">
            <div>
              <h2>AI + Energy &amp; Sustainability</h2>
              <p className="lede">Where this epic meets the Energy Profile epic. Figures come only from what the day&rsquo;s stories state on the record.</p>
            </div>
            <div className="side">
              VI · {e.energy.storyCount} stories · joined with iea_news
            </div>
          </div>
          <EnergyChapter energy={e.energy} />
        </section>

        <section className="chapter wrap" id="sources">
          <div className="chapter-head">
            <div>
              <h2>Sources</h2>
              <p className="lede">Every link in this edition, grouped by outlet. Nothing here is edited after the freeze; corrections run in the next edition.</p>
            </div>
            <div className="side">
              VII · {counts.links} links · {counts.outlets} outlets
            </div>
          </div>
          <Sources groups={groups} />
        </section>

        <section className="chapter wrap" id="previous">
          <div className="chapter-head">
            <div>
              <h2>Previous editions</h2>
              <p className="lede">One snapshot a day, kept forever. Each is the edition as it was frozen — the live feed keeps moving underneath, the snapshots don&rsquo;t.</p>
            </div>
            <div className="side">Edition archive</div>
          </div>
          <PreviousEditions current={e} previous={previous} />
        </section>

        <footer className="wrap">
          <div>
            {sample
              ? 'Sample edition for design review. Headlines, figures and paper titles are illustrative and link to outlet home pages, not articles.'
              : `Composed ${e.generatedAt ? new Date(e.generatedAt).toISOString().replace('T', ' ').slice(0, 16) : '—'} UTC by ${e.model ?? 'the pipeline'}${e.reviewedBy ? `, reviewed by ${e.reviewedBy}` : ''}. Published ${e.publishedAt ? new Date(e.publishedAt).toISOString().replace('T', ' ').slice(0, 16) : '—'} UTC.`}
          </div>
          <div className="colo">vizmaya.fyi · AI Data Centers epic · snapshot format v1</div>
        </footer>
      </main>

      <StoryPanel data={panelData} />
    </>
  )
}

/** The deck marks one clause with *asterisks* for emphasis. */
function Deck({ text }: { text: string }) {
  const parts = text.split(/\*([^*]+)\*/)
  if (parts.length === 1) return <>{text}</>
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <em key={i}>{p}</em> : <span key={i}>{p}</span>))}
    </>
  )
}
