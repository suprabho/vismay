'use client'

interface Props {
  current: number
  total: number
  onJump: (index: number) => void
}

/**
 * Right-edge step indicator for the deck format. One hairline per snap unit;
 * the active one is wider and darker. Clicking jumps the snap container to
 * the matching section. Hidden on portrait viewports (the indicator clutters
 * narrow widths and the section count is more legible than a long dot stack
 * on small screens).
 *
 * Mounted from `StoryMapShell` only when `defaults.progress === true`, so
 * other deck stories don't inherit the indicator by default.
 */
export function DeckProgress({ current, total, onJump }: Props) {
  // `mix-blend-mode: difference` lets the indicator stay legible whether the
  // active section is bone-white (the editorial body) or near-black (the
  // full-bleed hero). White paint over a light bg becomes dark; over a dark
  // bg it stays bright. Way simpler than detecting the active section's
  // dominant color from JS and switching tokens.
  return (
    <nav
      aria-label="Section progress"
      className="fixed right-6 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-[10px] pointer-events-auto [@media(max-aspect-ratio:1/1)]:hidden"
      style={{ mixBlendMode: 'difference' }}
    >
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === current
        return (
          <button
            key={i}
            type="button"
            aria-label={`Jump to section ${i + 1} of ${total}`}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => onJump(i)}
            className="block h-px transition-all duration-200 cursor-pointer"
            style={{
              width: isActive ? 28 : 16,
              background: isActive
                ? 'rgba(255,255,255,0.95)'
                : 'rgba(255,255,255,0.45)',
            }}
          />
        )
      })}
    </nav>
  )
}
