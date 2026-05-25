'use client';

import Link from 'next/link';
import { useEditorialEpic } from '@/lib/useEditorialStories';
import type { EditorialStorySummary } from '@footshorts/shared';
import FifaWc26EpicLanding from '@/components/fifa-wc26/FifaWc26EpicLanding';

// Same hash-based gradient as EditorialMagazine so cards stay visually
// consistent across the magazine and the epic landing.
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

function StoryTile({ story }: { story: EditorialStorySummary }) {
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

export default function EditorialEpic({ slug }: { slug: string }) {
  const { data, isLoading, error } = useEditorialEpic(slug);

  // Bespoke epics (e.g. the FIFA WC26 map) render their own full-screen landing
  // with self-contained chrome, in place of the generic story grid below.
  if (data && data.landingComponent === 'fifa-wc26') {
    return <FifaWc26EpicLanding epic={data} />;
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="sticky top-0 z-20 bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center px-4 py-3">
          <Link
            href="/feed?tab=editorial"
            aria-label="Back to editorial"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface/80 text-text transition-colors hover:bg-surface"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-5 w-5"
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-16">
        {isLoading && (
          <div className="flex h-[60vh] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}

        {error && (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center">
            <p className="mb-2 text-lg text-text">Could not load</p>
            <p className="text-sm text-muted">{(error as Error).message}</p>
          </div>
        )}

        {!isLoading && !error && !data && (
          <div className="flex h-[60vh] flex-col items-center justify-center text-center">
            <p className="mb-2 text-lg text-text">Epic not found</p>
            <p className="text-sm text-muted">It may not be available in Footshorts.</p>
          </div>
        )}

        {data && (
          <>
            <header
              className="mb-8 overflow-hidden rounded-2xl border border-border p-6 text-white"
              style={{ background: gradientFor(data.slug) }}
            >
              <div className="text-[0.7rem] uppercase tracking-[0.18em] opacity-80">Epic</div>
              <h1 className="mt-2 font-serif text-3xl leading-tight md:text-4xl">{data.name}</h1>
              {data.description && (
                <p className="mt-3 max-w-prose text-sm leading-relaxed opacity-90">
                  {data.description}
                </p>
              )}
            </header>

            {data.stories.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">
                No stories in this epic yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {data.stories.map((s) => (
                  <StoryTile key={s.slug} story={s} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
