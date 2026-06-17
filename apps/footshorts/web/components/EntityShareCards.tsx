'use client';

import { useEntityShareCards } from '@/lib/useShareCards';

/** A horizontal strip of share cards tagged with one entity. Renders nothing
 *  when the entity has no shipped cards, so it's safe to drop on any page. */
export function EntityShareCards({
  entityId,
  title = 'Cards',
}: {
  entityId: string | undefined;
  title?: string;
}) {
  const { data } = useEntityShareCards(entityId);
  const items = data ?? [];
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-semibold text-text">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {items.map((c) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={c.id}
            src={c.image_url}
            alt={c.name}
            className="h-72 w-auto shrink-0 rounded-xl border border-border object-contain"
          />
        ))}
      </div>
    </section>
  );
}
