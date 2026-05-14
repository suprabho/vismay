'use client'

import { useMemo, useState } from 'react'

type Ratio = '1:1' | '3:4' | '4:3'

interface Props {
  assets: { card_id: string; ratio: string; public_url: string }[]
}

const RATIOS: Ratio[] = ['1:1', '3:4', '4:3']

const RATIO_BOX: Record<Ratio, string> = {
  '1:1': '1 / 1',
  '3:4': '3 / 4',
  '4:3': '4 / 3',
}

const RATIO_GRID: Record<Ratio, string> = {
  '1:1': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  '3:4': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  '4:3': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
}

export default function ShareGallery({ assets }: Props) {
  const availableRatios = useMemo(() => {
    const present = new Set(assets.map((a) => a.ratio))
    return RATIOS.filter((r) => present.has(r))
  }, [assets])

  const [ratio, setRatio] = useState<Ratio>(availableRatios[0] ?? '1:1')
  const activeRatio: Ratio = availableRatios.includes(ratio)
    ? ratio
    : availableRatios[0] ?? '1:1'

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

  // Preserve card order by first appearance, keep only the selected ratio.
  const cardOrder: string[] = []
  for (const a of assets) {
    if (!cardOrder.includes(a.card_id)) cardOrder.push(a.card_id)
  }
  const visible = cardOrder
    .map((id) => assets.find((a) => a.card_id === id && a.ratio === activeRatio))
    .filter(Boolean) as Props['assets']

  return (
    <section
      className="border-t"
      style={{ borderColor: 'var(--demo-fg-line)', background: 'var(--demo-bg)' }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="mb-12 flex flex-col gap-8 md:flex-row md:items-end md:justify-between md:gap-12">
          <div className="max-w-2xl">
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
          {availableRatios.length > 1 && (
            <RatioSwitcher
              ratios={availableRatios}
              value={activeRatio}
              onChange={setRatio}
            />
          )}
        </div>

        <div className={`grid gap-4 ${RATIO_GRID[activeRatio]}`}>
          {visible.map((item) => (
            <div key={item.card_id} className="flex flex-col gap-2">
              <div
                className="relative w-full overflow-hidden rounded-2xl"
                style={{
                  aspectRatio: RATIO_BOX[activeRatio],
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
      </div>
    </section>
  )
}

function RatioSwitcher({
  ratios,
  value,
  onChange,
}: {
  ratios: Ratio[]
  value: Ratio
  onChange: (r: Ratio) => void
}) {
  return (
    <div
      className="inline-flex shrink-0 gap-1 rounded-full p-1"
      style={{
        background: 'var(--demo-bg-2)',
        border: '1px solid var(--demo-fg-line)',
      }}
    >
      {ratios.map((r) => {
        const active = value === r
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            className="px-4 py-1.5 rounded-full text-xs uppercase tracking-[0.2em] transition-colors"
            style={{
              background: active ? 'var(--demo-accent)' : 'transparent',
              color: active ? 'var(--demo-bg)' : 'var(--demo-fg-mute)',
            }}
          >
            {r}
          </button>
        )
      })}
    </div>
  )
}
