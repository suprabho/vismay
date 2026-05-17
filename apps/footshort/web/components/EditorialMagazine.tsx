'use client';

import Link from 'next/link';
import { useEditorialStories } from '@/lib/useEditorialStories';
import type { EditorialStorySummary } from '@shortfoot/shared';

// Each card has a deterministic gradient. If the story's frontmatter declared
// a theme.colors.accent, use its hue so the card mirrors the story's identity.
// Otherwise hash the slug. Cover images are a future iteration.
function slugHue(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

function hexToHue(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

function gradientFor(slug: string, themeAccent: string | null): string {
  const hue = (themeAccent ? hexToHue(themeAccent) : null) ?? slugHue(slug);
  return `linear-gradient(135deg, hsl(${hue} 70% 22%) 0%, hsl(${(hue + 60) % 360} 55% 12%) 100%)`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function HeroCard({ story }: { story: EditorialStorySummary }) {
  return (
    <Link
      href={`/editorial/${story.slug}`}
      className="group relative block overflow-hidden rounded-2xl border border-border"
      style={{ background: gradientFor(story.slug, story.themeAccent), aspectRatio: '5 / 4' }}
    >
      <div className="flex h-full flex-col justify-between p-6 text-white">
        <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.18em] opacity-80">
          <span>Editorial</span>
          <span aria-hidden>·</span>
          <time dateTime={story.publishedAt ?? story.createdAt}>
            {formatDate(story.publishedAt ?? story.createdAt)}
          </time>
          {story.byline && (
            <>
              <span aria-hidden>·</span>
              <span>{story.byline}</span>
            </>
          )}
        </div>
        <div>
          <h2 className="font-serif text-2xl leading-tight md:text-3xl">{story.title}</h2>
          {story.subtitle && (
            <p className="mt-2 max-w-prose text-sm leading-snug opacity-85 md:text-base">
              {story.subtitle}
            </p>
          )}
          <div className="mt-3 inline-flex items-center gap-1.5 text-sm opacity-80 group-hover:opacity-100">
            Read story
            <span aria-hidden>→</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function GridCard({ story }: { story: EditorialStorySummary }) {
  return (
    <Link
      href={`/editorial/${story.slug}`}
      className="group relative block overflow-hidden rounded-xl border border-border"
      style={{ background: gradientFor(story.slug, story.themeAccent), aspectRatio: '4 / 5' }}
    >
      <div className="flex h-full flex-col justify-between p-4 text-white">
        <time
          dateTime={story.publishedAt ?? story.createdAt}
          className="text-[0.65rem] uppercase tracking-[0.18em] opacity-75"
        >
          {formatDate(story.publishedAt ?? story.createdAt)}
        </time>
        <div>
          <h3 className="font-serif text-base leading-snug">{story.title}</h3>
          {story.subtitle && (
            <p className="mt-1 line-clamp-2 text-xs leading-snug opacity-75">{story.subtitle}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function EditorialMagazine() {
  const { data, isLoading, error } = useEditorialStories({ limit: 24 });

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

  const stories = data ?? [];

  if (stories.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="mb-2 text-lg text-text">No stories yet</p>
        <p className="text-sm text-muted">
          Editorial pieces from vizmaya.fyi will appear here as they ship.
        </p>
      </div>
    );
  }

  const [hero, ...rest] = stories;
  if (!hero) return null;

  return (
    <div className="pb-12">
      <HeroCard story={hero} />
      {rest.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          {rest.map((s) => (
            <GridCard key={s.slug} story={s} />
          ))}
        </div>
      )}
    </div>
  );
}
