interface Props {
  assets: { card_id: string; ratio: string; public_url: string }[]
}

const RATIOS: Array<'1:1' | '3:4' | '4:3'> = ['1:1', '3:4', '4:3']

const RATIO_BOX: Record<string, string> = {
  '1:1': '1 / 1',
  '3:4': '3 / 4',
  '4:3': '4 / 3',
}

export default function ShareGallery({ assets }: Props) {
  if (assets.length === 0) {
    return (
      <section
        className="border-t"
        style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg)' }}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-24 text-center">
          <p className="text-sm" style={{ color: 'var(--demo-fg-mute)' }}>
            Share assets aren’t rendered yet — curate cards in the admin and click
            “Render share assets”.
          </p>
        </div>
      </section>
    )
  }

  // Group by card_id, then sort each group by ratio so each card row reads
  // 1:1 → 3:4 → 4:3.
  const byCard = new Map<string, { card_id: string; ratio: string; public_url: string }[]>()
  for (const a of assets) {
    const arr = byCard.get(a.card_id) ?? []
    arr.push(a)
    byCard.set(a.card_id, arr)
  }
  const ordered = Array.from(byCard.entries()).map(([card_id, items]) => ({
    card_id,
    items: RATIOS.map((r) => items.find((i) => i.ratio === r)).filter(Boolean) as typeof items,
  }))

  return (
    <section
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="mb-12 max-w-2xl">
          <div
            className="text-xs uppercase tracking-[0.3em] mb-4"
            style={{ color: 'var(--demo-accent)' }}
          >
            Share assets
          </div>
          <h2
            className="demo-serif text-4xl md:text-5xl leading-[1.05]"
            style={{ color: 'var(--demo-fg)' }}
          >
            Six cards. Three sizes.
          </h2>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: 'var(--demo-fg-dim)' }}
          >
            Curated stills your social desk can drop into Instagram, X, and the
            morning newsletter.
          </p>
        </div>

        <div className="space-y-12">
          {ordered.map(({ card_id, items }) => (
            <div key={card_id} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              {items.map((item) => (
                <div key={item.ratio} className="flex flex-col gap-2">
                  <div
                    className="relative w-full overflow-hidden"
                    style={{
                      aspectRatio: RATIO_BOX[item.ratio] ?? '1 / 1',
                      background: 'var(--demo-bg-2)',
                      border: '1px solid var(--demo-fg-line)',
                    }}
                  >
                    <img
                      src={item.public_url}
                      alt={`${item.ratio} share asset`}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  <a
                    href={item.public_url}
                    download
                    className="text-[10px] uppercase tracking-[0.2em]"
                    style={{ color: 'var(--demo-fg-mute)' }}
                  >
                    {item.ratio} · download ↓
                  </a>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
