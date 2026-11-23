'use client';

import Link from 'next/link';
import { useEditorialEpics, useEditorialStories } from '@/lib/useEditorialStories';
import { useHtmlStories } from '@/lib/useHtmlStories';
import type { EditorialEpicSummary, EditorialStorySummary } from '@footshorts/shared';
import { HTML_STORY_FORMAT_META, isPagedHtmlStoryFormat } from '@vismay/html-stories/formats';
import type { PublishedHtmlStory } from '@vismay/html-stories/htmlStories';
import { storyUrl } from '@vismay/story-embed/url';
import { LivePreview } from '@/components/LivePreview';

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
  /**
   * The story itself, chrome-less, as the card previews it live (LivePreview):
   * the render service's embed for an editorial story, the HTML story's own
   * `?preview=1` (no site chrome, no format controls, no Listen player).
   */
  previewSrc: string;
  /** The preview's ground until the story shows: the page's palette when it declared a dark one, else the slug gradient. */
  background: string;
  /** The caption's ground, a solid colour the preview fades into. */
  solid: string;
  /** True for /s/<slug>: rendered with <a>, not <Link>. */
  external: boolean;
  /** An HTML story's format when it isn't a scrolling page ("Book", "Board", "Deck"). */
  format: string | null;
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

function solidFor(slug: string): string {
  return `hsl(${slugHue(slug)} 60% 14%)`;
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
    previewSrc: storyUrl(story.slug),
    background: gradientFor(story.slug),
    solid: solidFor(story.slug),
    external: false,
    format: null,
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
  const themed = isDark(t?.background) && !!t?.accent;
  const background = themed
    ? `linear-gradient(135deg, ${t.surface ?? t.background} 0%, ${t.background} 60%, ${t.accent}33 100%)`
    : gradientFor(story.slug);
  return {
    key: `html:${story.slug}`,
    href: `/s/${story.slug}`,
    title: story.title,
    date: story.publishedAt ?? story.updatedAt,
    previewSrc: `/s/${encodeURIComponent(story.slug)}?preview=1`,
    background,
    solid: themed && t?.background ? t.background : solidFor(story.slug),
    external: true,
    // The listing API's JSON may predate the field; only a known paged format gets a label.
    format: isPagedHtmlStoryFormat(story.format) ? HTML_STORY_FORMAT_META[story.format].label : null,
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

/**
 * The card's picture: the story itself, running live (only while on screen;
 * see LivePreview), above the caption and fading into its colour, as the
 * vizmaya.fyi home wall shows its stories. Until it loads (or for a reader
 * saving data) the card's gradient shows.
 */
function CardPreview({ card }: { card: MagazineCard }) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: card.background }}>
      <LivePreview
        src={card.previewSrc}
        title={card.title}
        className="transition-transform duration-700 ease-out group-hover:scale-[1.02]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-10"
        style={{ background: `linear-gradient(to top, ${card.solid}, transparent)` }}
      />
    </div>
  );
}

/** "Board · Nov 23, 2026": the card's format, when it isn't a scrolling page, and its date. */
function CardMeta({ card, lead }: { card: MagazineCard; lead?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 overflow-hidden whitespace-nowrap uppercase opacity-75 ${lead ? 'text-[0.7rem] tracking-[0.18em]' : 'text-[0.65rem] tracking-[0.12em]'}`}
    >
      {lead && (
        <>
          <span>Editorial</span>
          <span aria-hidden>·</span>
        </>
      )}
      {card.format && (
        <>
          <span>{card.format}</span>
          <span aria-hidden>·</span>
        </>
      )}
      <time dateTime={card.date}>{formatDate(card.date)}</time>
    </div>
  );
}

function HeroCard({ card }: { card: MagazineCard }) {
  return (
    <CardLink
      card={card}
      className="group relative flex aspect-[4/5] flex-col overflow-hidden rounded-2xl border border-border text-white sm:aspect-[5/4]"
      style={{ background: card.solid }}
    >
      <CardPreview card={card} />
      <div className="flex-none px-5 pb-5 pt-2 md:px-6 md:pb-6">
        <CardMeta card={card} lead />
        <h2 className="mt-2 font-serif text-2xl leading-tight md:text-3xl">{card.title}</h2>
        <div className="mt-3 inline-flex items-center gap-1.5 text-sm opacity-80 group-hover:opacity-100">
          Read story
          <span aria-hidden>→</span>
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
      className="group relative flex aspect-[3/4] flex-col overflow-hidden rounded-xl border border-border text-white"
      style={{ background: card.solid }}
    >
      <CardPreview card={card} />
      <div className="flex-none px-3.5 pb-4 pt-1.5">
        <CardMeta card={card} />
        <h3 className="mt-1.5 line-clamp-3 font-serif text-base leading-snug">{card.title}</h3>
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
