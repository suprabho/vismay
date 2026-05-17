'use client';

import Link from 'next/link';
import { useEditorialStories } from '@/lib/useEditorialStories';
import type { EditorialStorySummary } from '@shortfoot/shared';

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

function HeroCard({ story }: { story: EditorialStorySummary }) {
  return (
    <Link
      href={`/editorial/${story.slug}`}
      className="group relative block overflow-hidden rounded-2xl border border-border"
      style={{ background: gradientFor(story.slug), aspectRatio: '5 / 4' }}
    >
      <div className="flex h-full flex-col justify-between p-6 text-white">
        <div className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.18em] opacity-80">
          <span>Editorial</span>
          <span aria-hidden>·</span>
          <time dateTime={story.publishedAt ?? story.createdAt}>
            {formatDate(story.publishedAt ?? story.createdAt)}
          </time>
        </div>
        <div>
          <h2 className="font-serif text-2xl leading-tight md:text-3xl">{story.title}</h2>
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
      style={{ background: gradientFor(story.slug), aspectRatio: '4 / 5' }}
    >
      <div className="flex h-full flex-col justify-between p-4 text-white">
        <time
          dateTime={story.publishedAt ?? story.createdAt}
          className="text-[0.65rem] uppercase tracking-[0.18em] opacity-75"
        >
          {formatDate(story.publishedAt ?? story.createdAt)}
        </time>
        <h3 className="font-serif text-base leading-snug">{story.title}</h3>
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
