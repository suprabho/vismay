import Link from 'next/link'
import { CaretRight } from '@phosphor-icons/react/ssr'
import { CardActions } from '@/components/CardActions'
import { MarginHero } from '@/components/MarginChart'
import { TeamChip } from '@/components/ui'
import { feed, type FeedItem } from '@/lib/feed'
import { ago } from '@/lib/time'

export const dynamic = 'force-dynamic'

const FEED_HEIGHT = 'h-[calc(100dvh-56px)]'

export default async function FeedPage() {
  const items = await feed()
  if (!items.length) {
    return (
      <main className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted">
        The feed is empty right now. Check back after tonight&apos;s games.
      </main>
    )
  }
  return (
    <main className={`no-scrollbar ${FEED_HEIGHT} snap-y snap-mandatory overflow-y-auto overscroll-contain`}>
      {items.map((item, i) => (
        <section key={item.id} className={`${FEED_HEIGHT} snap-start snap-always p-3`} aria-label={`Story ${i + 1} of ${items.length}`}>
          <FeedCard item={item} />
        </section>
      ))}
    </main>
  )
}

function Hero({ item }: { item: FeedItem }) {
  const fade = '[mask-image:linear-gradient(to_bottom,#000_58%,transparent_100%)]'
  if (item.game) {
    return (
      <div className={`relative min-h-[230px] flex-1 bg-well ${fade}`}>
        <MarginHero detail={item.game.detail} run={item.game.run} />
      </div>
    )
  }
  if (item.image) {
    return (
      <div className={`relative min-h-[200px] flex-1 bg-well ${fade}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- remote ESPN/CDN images of unknown host */}
        <img src={item.image} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
      </div>
    )
  }
  const [a, b] = item.teams
  return (
    <div className={`relative min-h-[160px] flex-1 overflow-hidden bg-well ${fade}`}>
      {a && (
        <div
          className="absolute -top-24 -left-1/4 h-64 w-[150%] rounded-full opacity-40"
          style={{ background: `radial-gradient(closest-side, ${a.bg}, transparent)` }}
        />
      )}
      {b && (
        <div
          className="absolute -top-24 -right-1/2 h-64 w-[110%] rounded-full opacity-40"
          style={{ background: `radial-gradient(closest-side, ${b.bg}, transparent)` }}
        />
      )}
    </div>
  )
}

function FeedCard({ item }: { item: FeedItem }) {
  const g = item.game?.detail.game
  return (
    <article className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-surface">
      <Hero item={item} />
      <div className="relative -mt-9 flex min-h-0 flex-col gap-3 px-5 pb-4">
        <div className="flex items-center gap-2 text-[11px] tracking-[0.08em] uppercase">
          <span className="rounded-full bg-accent px-2 py-[3px] font-bold text-accent-ink">{item.publisher}</span>
          <span className="text-text/70">{ago(item.published)}</span>
          <span className="rounded-full border border-text/20 px-2 py-0.5 text-text/70">{item.label}</span>
        </div>
        <h1 className="line-clamp-4 text-[25px] leading-[1.12] font-semibold tracking-[-0.01em] wdth-88">{item.headline}</h1>
        {item.body && <p className="line-clamp-5 text-sm leading-[1.55] text-text/80">{item.body}</p>}
        {item.teams.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.teams.map((t) => (
              <TeamChip key={t.id} team={t} />
            ))}
          </div>
        )}
        {g && (
          <Link
            href={`/game/${g.id}`}
            className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-bg px-3"
          >
            <span className="font-mono text-[10px] text-muted">{g.status || 'FINAL'}</span>
            <span className="font-mono text-[13px] font-semibold">
              {g.away.team.abbr} {g.away.score} – {g.home.score} {g.home.team.abbr}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              Box score <CaretRight size={12} weight="bold" />
            </span>
          </Link>
        )}
        <div className="flex items-center justify-between">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-accent">
              Read on {item.publisher} →
            </a>
          ) : (
            <span />
          )}
          <CardActions id={item.id} title={item.headline} url={item.url} />
        </div>
      </div>
    </article>
  )
}
