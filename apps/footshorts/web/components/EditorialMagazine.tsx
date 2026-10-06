'use client';

import Link from 'next/link';
import { useEditorialEpics, useEditorialStories } from '@/lib/useEditorialStories';
import { useHtmlStories } from '@/lib/useHtmlStories';
import type { EditorialEpicSummary, EditorialStorySummary } from '@footshorts/shared';
import type { PublishedHtmlStory } from '@vismay/html-stories/htmlStories';
import { AuraBackground } from '@/components/AuraBackground';

/**
 * One magazine card, whichever table it came from: a viz-engine editorial story
 * (`/editorial/<slug>`, client-routed) or an agent-authored HTML story
 * (`/s/<slug>`, a route handler, so a plain full navigation).
 */
interface MagazineCard {
  key: string;
  href: string;
  title: string;
  /** Sort key and the card's date: published_at, else created/updated. */
  date: string;
  aura: string | null;
  /** Inline background when the page declared its palette; else the slug gradient. */
  background: string;
  /** True for /s/<slug>: rendered with <a>, not <Link>. */
  external: boolean;
}

// Hash slug → HSL hue so each story has a distinct, deterministic accent
// gradient. Cover images live in story frontmatter and aren't fetched here
// yet; a hash-based gradient gets us shippable cards without a schema change.
function slugHue(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

function gradientFor(slug: string): string {
  const hue = slugHue(slug);
  return `linear-gradient(135deg, hsl(${hue} 70% 22%) 0%, hsl(${(hue + 60) % 360} 55% 12%) 100%)`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function editorialCard(story: EditorialStorySummary): MagazineCard {
  return {
    key: `editorial:${story.slug}`,
    href: `/editorial/${story.slug}`,
    title: story.title,
    date: story.publishedAt ?? story.createdAt,
    aura: story.aura,
    background: gradientFor(story.slug),
    external: false,
  };
}

/**
 * True for a hex colour dark enough to carry the cards' white text. Story
 * palettes are often light (cream paper); those cards keep the slug colour.
 */
function isDark(hex: string | undefined): hex is string {
  if (!hex || !/^#?[0-9a-f]{6}$/i.test(hex)) return false;
  const n = parseInt(hex.slice(-6), 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.4;
}

/** An HTML story wears its own palette (its `vizmaya:theme` meta) when it declared a dark one. */
function htmlStoryCard(story: PublishedHtmlStory): MagazineCard {
  const t = story.theme;
  const background =
    isDark(t?.background) && t?.accent
      ? `linear-gradient(135deg, ${t.surface ?? t.background} 0%, ${t.background} 60%, ${t.accent}33 100%)`
      : gradientFor(story.slug);
  return {
    key: `html:${story.slug}`,
    href: `/s/${story.slug}`,
    title: story.title,
    date: story.publishedAt ?? story.updatedAt,
    aura: story.aura,
    background,
    external: true,
  };
}

/** <Link> for app routes, <a> for the HTML story route handler. */
function CardLink({
  card,
  className,
  style,
  children,
}: {
  card: MagazineCard;
  className: string;
  style: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (card.external) {
    return (
      <a href={card.href} className={className} style={style}>
        {children}
      </a>
    );
  }
  return (
    <Link href={card.href} className={className} style={style}>
      {children}
    </Link>
  );
}

function HeroCard({ card }: { card: MagazineCard }) {
  return (
    <CardLink
      card={card}
      className="group relative block overflow-hidden rounded-2xl border border-border"
      style={{ background: card.background, aspectRatio: '5 / 4' }}
    >
      {card.aura && <AuraBackground slug={card.aura} />}
      <div className="relative z-10 flex h-full flex-col justify-between p-6 text-white">
        <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.18em] opacity-80">
          <span>Editorial</span>
          <span aria-hidden>·</span>
          <time dateTime={card.date}>{formatDate(card.date)}</time>
        </div>
        <div>
          <h2 className="font-serif text-2xl leading-tight md:text-3xl">{card.title}</h2>
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm opacity-80 group-hover:opacity-100">
            Read story
            <span aria-hidden>→</span>
          </div>
        </div>
      </div>
    </CardLink>
  );
}

function EpicCard({ epic }: { epic: EditorialEpicSummary }) {
  return (
    <Link
      href={`/editorial/epic/${epic.slug}`}
      className="group relative block flex-shrink-0 snap-start overflow-hidden rounded-xl border border-border"
      style={{ background: gradientFor(epic.slug), width: '78%', maxWidth: 320, aspectRatio: '16 / 9' }}
    >
      <div className="flex h-full flex-col justify-between p-4 text-white">
        <div className="text-[0.65rem] uppercase tracking-[0.18em] opacity-80">Epic</div>
        <div>
          <h3 className="font-serif text-lg leading-tight">{epic.name}</h3>
          {epic.description && (
            <p className="mt-1 line-clamp-2 text-xs opacity-80">{epic.description}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function GridCard({ card }: { card: MagazineCard }) {
  return (
    <CardLink
      card={card}
      className="group relative block overflow-hidden rounded-xl border border-border"
      style={{ background: card.background, aspectRatio: '4 / 5' }}
    >
      {card.aura && <AuraBackground slug={card.aura} />}
      <div className="relative z-10 flex h-full flex-col justify-between p-4 text-white">
        <time dateTime={card.date} className="text-[0.65rem] uppercase tracking-[0.18em] opacity-75">
          {formatDate(card.date)}
        </time>
        <h3 className="font-serif text-base leading-snug">{card.title}</h3>
      </div>
    </CardLink>
  );
}

export function EditorialMagazine() {
  const { data: stories, isLoading, error } = useEditorialStories({ limit: 24 });
  // Epics load independently of stories — they're a separate strip and
  // shouldn't block the magazine from rendering when the stories query
  // returns first.
  const { data: epics } = useEditorialEpics();
  // Agent-authored HTML stories (footshorts.com/s/<slug>) sit in the same
  // magazine, newest first alongside the editorial stories. Also independent:
  // a slow or failed read never blocks the rest.
  const { data: htmlStories } = useHtmlStories();

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="mb-2 text-lg text-text">Could not load</p>
        <p className="text-sm text-muted">{(error as Error).message}</p>
      </div>
    );
  }

  const cards: MagazineCard[] = [
    ...(stories ?? []).map(editorialCard),
    ...(htmlStories ?? []).map(htmlStoryCard),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const safeEpics = epics ?? [];

  if (cards.length === 0 && safeEpics.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="mb-2 text-lg text-text">No stories yet</p>
        <p className="text-sm text-muted">
          Editorial pieces from vizmaya.fyi will appear here as they ship.
        </p>
      </div>
    );
  }

  const [hero, ...rest] = cards;

  return (
    <div className="pb-12">
      {safeEpics.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-[0.7rem] uppercase tracking-[0.18em] text-muted">Epics</div>
          {/* Horizontal scroll on every viewport — Footshorts web is mobile-first
              and an Epic strip with 3+ entries would otherwise crowd the hero. */}
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {safeEpics.map((e) => (
              <EpicCard key={e.slug} epic={e} />
            ))}
          </div>
        </div>
      )}
      {hero && <HeroCard card={hero} />}
      {rest.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {rest.map((c) => (
            <GridCard key={c.key} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}
