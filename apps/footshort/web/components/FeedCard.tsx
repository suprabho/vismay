'use client';

import { useEffect, useRef } from 'react';

type Props = {
  articleId: string;
  headline: string;
  summary: string | null;
  imageUrl: string | null;
  publisher: string;
  url: string;
  publishedAt: string;
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
  onSeen,
}: Props) {
  const ref = useRef<HTMLElement>(null);

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
      <div className="shrink-0 grow-0 basis-[40%] overflow-hidden bg-bg">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-muted">No image</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col bg-bg px-6 pt-5 pb-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text">
            {publisher}
          </span>
          <span className="text-xs text-muted">{relativeTime(publishedAt)}</span>
        </div>

        <h2 className="mb-3 text-xl font-bold leading-tight text-text">{headline}</h2>

        {summary ? (
          <p className="text-[15px] leading-[22px] text-text/80">{summary}</p>
        ) : (
          <p className="text-sm italic text-muted">Summary unavailable.</p>
        )}

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
