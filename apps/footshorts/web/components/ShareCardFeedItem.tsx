'use client';

import Link from 'next/link';
import type { FeedCardEntity } from '@footshorts/shared/schemas';

type Props = {
  imageUrl: string;
  name: string;
  entities?: FeedCardEntity[];
};

function entityHref(e: FeedCardEntity): string {
  if (e.type === 'league') return `/league/${e.slug}`;
  if (e.type === 'team') return `/team/${e.slug}`;
  return `/player/${e.slug}`;
}

/** A shipped share card as a full-bleed feed item: the rendered PNG centered on
 *  the surface, with its entity tags as links underneath. */
export function ShareCardFeedItem({ imageUrl, name, entities }: Props) {
  const tags = entities ?? [];
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border bg-bg">
      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={name}
          className="max-h-full max-w-full rounded-2xl object-contain shadow-xl"
        />
      </div>
      {tags.length > 0 ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 bg-bg px-4 pb-4 pt-1">
          {tags.map((e) => (
            <Link
              key={e.id}
              href={entityHref(e)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text hover:border-muted"
            >
              {e.crest_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.crest_url} alt="" className="h-4 w-4 object-contain" />
              ) : null}
              {e.name}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}
