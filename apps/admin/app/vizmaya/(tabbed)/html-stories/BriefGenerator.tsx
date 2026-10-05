'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, Shuffle, X } from '@phosphor-icons/react'
import { htmlStoryBrief } from '@vismay/html-stories/brief'
import { pickRandomStyle, type StoryStyle, type StylePool } from '@vismay/html-stories/styles'

const SWATCHES = ['background', 'surface', 'text', 'muted', 'accent', 'accent2', 'teal'] as const

/**
 * "Copy agent brief" plus a style randomizer: Shuffle swaps the brief's house
 * style for a palette and font trio drawn from the existing stories' themes.
 */
export function BriefGenerator({ siteUrl, pool }: { siteUrl: string; pool: StylePool | null }) {
  const [style, setStyle] = useState<StoryStyle | null>(null)
  const [copied, setCopied] = useState(false)
  const brief = useMemo(() => htmlStoryBrief({ siteUrl, style }), [siteUrl, style])
  const canShuffle = !!pool?.palettes.length && !!pool.fonts.length

  return (
    <div className="flex flex-wrap items-center gap-2">
      {style && (
        <div
          className="flex items-center gap-2 pl-2 pr-1 py-1 border border-white/10 rounded-lg text-xs text-neutral-300"
          title={`Colours: ${style.paletteFrom.title}\nType: ${style.fontsFrom.title}`}
        >
          <span className="flex">
            {SWATCHES.map((k) => (
              <span
                key={k}
                className="w-3.5 h-3.5 rounded-full border border-white/20 -ml-1 first:ml-0"
                style={{ background: style.palette[k] }}
              />
            ))}
          </span>
          <span className="truncate max-w-[16rem]">
            {style.fonts.serif} · {style.fonts.sans} · {style.fonts.mono}
          </span>
          <button
            onClick={() => setStyle(null)}
            className="p-1 text-neutral-500 hover:text-white rounded"
            aria-label="Back to house style"
            title="Back to house style"
          >
            <X size={12} />
          </button>
        </div>
      )}
      <button
        onClick={() => pool && setStyle((prev) => pickRandomStyle(pool, { previous: prev }))}
        disabled={!canShuffle}
        title={canShuffle ? 'Pick a palette and fonts from an existing story' : 'No story themes to draw from'}
        className="text-sm text-neutral-200 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5 inline-flex items-center gap-1.5 disabled:opacity-40 disabled:pointer-events-none"
      >
        <Shuffle size={14} />
        {style ? 'Shuffle' : 'Randomize style'}
      </button>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(brief)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="text-sm text-neutral-200 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5 inline-flex items-center gap-1.5"
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy agent brief'}
      </button>
    </div>
  )
}
