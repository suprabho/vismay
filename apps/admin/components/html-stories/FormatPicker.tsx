'use client'

import { BookOpen, Presentation, PushPin, Rows, type Icon } from '@phosphor-icons/react'
import { HTML_STORY_FORMATS, HTML_STORY_FORMAT_META, type HtmlStoryFormat } from '@vismay/html-stories/formats'

const ICONS: Record<HtmlStoryFormat, Icon> = {
  scroll: Rows,
  book: BookOpen,
  board: PushPin,
  deck: Presentation,
}

/**
 * Which story format the agent brief is for (packages/html-stories/src/formats):
 * a scrolling page, or a book, board or deck on the site's hosted runtime.
 * `suggested` marks the format a randomizer spin's kind of story suits.
 */
export function FormatPicker({
  value,
  onChange,
  suggested,
}: {
  value: HtmlStoryFormat
  onChange: (format: HtmlStoryFormat) => void
  suggested?: HtmlStoryFormat | null
}) {
  return (
    <div role="radiogroup" aria-label="Story format" className="inline-flex items-center gap-0.5 p-0.5 border border-white/10 rounded-lg">
      {HTML_STORY_FORMATS.map((f) => {
        const meta = HTML_STORY_FORMAT_META[f]
        const IconFor = ICONS[f]
        const on = f === value
        return (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(f)}
            title={`${meta.label}: ${meta.reader} Suits ${meta.suits}.${suggested === f ? ' Suggested for this spin.' : ''}`}
            className={`relative text-xs px-2 py-1 rounded-md inline-flex items-center gap-1 transition-colors ${
              on ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <IconFor size={13} />
            {meta.label}
            {suggested === f && !on && <span className="w-1.5 h-1.5 rounded-full bg-amber-400/80" aria-label="suggested" />}
          </button>
        )
      })}
    </div>
  )
}
