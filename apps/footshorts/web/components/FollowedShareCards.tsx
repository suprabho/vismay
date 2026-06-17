'use client';

import Link from 'next/link';
import { useFollowedShareCards } from '@/lib/useShareCards';

/** Share cards filed under the entities the signed-in user follows, grouped per
 *  entity. Surfaces in the For You tab; renders nothing when there are none. */
export function FollowedShareCards() {
  const { data } = useFollowedShareCards();
  const groups = data ?? [];
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-4 pb-2">
      {groups.map((g) => {
        const href = g.entity.type === 'league' ? `/league/${g.entity.slug}` : `/team/${g.entity.slug}`;
        return (
          <section key={g.entity.id}>
            <Link href={href} className="mb-2 flex items-center gap-2">
              {g.entity.crest_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.entity.crest_url} alt="" className="h-5 w-5 object-contain" />
              ) : null}
              <h3 className="text-sm font-semibold text-text">{g.entity.name}</h3>
            </Link>
            <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {g.items.map((c) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={c.id}
                  src={c.image_url}
                  alt={c.name}
                  className="h-56 w-auto shrink-0 rounded-xl border border-border object-contain"
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
