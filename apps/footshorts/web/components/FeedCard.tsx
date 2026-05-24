'use client';

import { useEffect, useRef, useState } from 'react';
import { getCompetitionPalette, darkenHex } from '@vismay/footshorts-viz/web';
import type { FeedCardEntity } from '@footshorts/shared/schemas';

const VISIBLE_TAGS = 3;

function entityColor(e: FeedCardEntity): string | undefined {
  if (e.primary_color) return e.primary_color;
  if (e.type === 'league') return getCompetitionPalette(e.slug);
  return undefined;
}

type PlaceholderEntity = { entity: FeedCardEntity; color: string };

function pickPlaceholderEntities(entities: FeedCardEntity[]): PlaceholderEntity[] {
  const picked: PlaceholderEntity[] = [];
  for (const e of entities) {
    const color = entityColor(e);
    if (!color) continue;
    if (picked.some((p) => p.color.toLowerCase() === color.toLowerCase())) continue;
    picked.push({ entity: e, color });
    if (picked.length === 2) break;
  }
  return picked;
}

type Props = {
  articleId: string;
  headline: string;
  summary: string | null;
  imageUrl: string | null;
  publisher: string;
  url: string;
  publishedAt: string;
  entities?: FeedCardEntity[];
  onSeen?: (articleId: string) => void;
};

function relativeTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function FeedCard({
  articleId,
  headline,
  summary,
  imageUrl,
  publisher,
  url,
  publishedAt,
  entities,
  onSeen,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const tags = entities ?? [];
  const visibleTags = tagsExpanded ? tags : tags.slice(0, VISIBLE_TAGS);
  const hiddenCount = tags.length - visibleTags.length;

  useEffect(() => {
    if (!onSeen || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            onSeen(articleId);
            observer.disconnect();
          }
        }
      },
      { threshold: [0.6] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [articleId, onSeen]);

  return (
    <article
      ref={ref}
      className="flex h-full flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border bg-surface"
    >
      <div className="shrink-0 grow-0 basis-[50%] overflow-hidden bg-bg">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <EntityPlaceholder entities={tags} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 bg-bg p-5 md:p-6">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text">
            {publisher}
          </span>
          <span className="text-xs text-muted">{relativeTime(publishedAt)}</span>
        </div>
        <div className="flex flex-col gap-2">
        <h2 className="text-xl font-bold leading-tight text-text">{headline}</h2>
        {summary ? (
          <p className="text-[15px] leading-[22px] text-text/80">{summary}</p>
        ) : (
          <p className="text-sm italic text-muted">Summary unavailable.</p>
        )}
        {tags.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {visibleTags.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text"
              >
                {e.crest_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.crest_url}
                    alt=""
                    className="h-4 w-4 object-contain"
                  />
                ) : null}
                {e.name}
              </span>
            ))}
            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => setTagsExpanded(true)}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted hover:text-text"
              >
                +{hiddenCount} more
              </button>
            ) : null}
          </div>
        ) : null}
        </div>
        
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto pt-4 self-start text-sm font-medium text-accent hover:underline"
        >
          Read at source →
        </a>
      </div>
    </article>
  );
}

function EntityPlaceholder({ entities }: { entities: FeedCardEntity[] }) {
  const picked = pickPlaceholderEntities(entities);

  if (picked.length === 0) {
    // No entity has a usable color (e.g. team with no primary_color yet), but
    // we may still have a crest to surface — fall back to a neutral tile.
    const withCrest = entities.find((e) => e.crest_url);
    if (withCrest) {
      return (
        <div className="flex h-full items-center justify-center bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={withCrest.crest_url!}
            alt=""
            className="h-1/2 max-h-40 w-auto object-contain drop-shadow-lg"
          />
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-muted">No image</span>
      </div>
    );
  }

  if (picked.length === 1) {
    const [a] = picked;
    const background = `linear-gradient(135deg, ${a.color} 0%, ${darkenHex(a.color, 0.4)} 100%)`;
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ background }}
      >
        {a.entity.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.entity.crest_url}
            alt=""
            className="h-1/2 max-h-40 w-auto object-contain drop-shadow-lg"
          />
        ) : null}
      </div>
    );
  }

  const [a, b] = picked;
  const background = `linear-gradient(135deg, ${a.color} 0%, ${a.color} 50%, ${b.color} 50%, ${b.color} 100%)`;
  return (
    <div className="relative h-full overflow-hidden" style={{ background }}>
      <div className="absolute inset-0 flex items-center justify-between px-[12%]">
        {a.entity.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.entity.crest_url}
            alt=""
            className="h-[40%] max-h-32 w-auto object-contain drop-shadow-lg"
          />
        ) : (
          <span />
        )}
        {b.entity.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={b.entity.crest_url}
            alt=""
            className="h-1/2 max-h-32 w-auto object-contain drop-shadow-lg"
          />
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
