'use client'

import { MaskHappy } from '@phosphor-icons/react'
import type { HtmlStoryTone } from '@vismay/html-stories/tone'

/**
 * The brief's tone toggle (@vismay/html-stories/tone): off is the straight
 * voice, on asks for a wry, a little sarcastic one under the same accuracy
 * rules. Used by the brief generator and the Randomizer tab.
 */
export function ToneToggle({
  value,
  onChange,
  className,
}: {
  value: HtmlStoryTone
  onChange: (tone: HtmlStoryTone) => void
  /** The host's button classes; the toggle adds its "on" tint. */
  className: string
}) {
  const humorous = value === 'humorous'
  return (
    <button
      type="button"
      onClick={() => onChange(humorous ? 'straight' : 'humorous')}
      aria-pressed={humorous}
      title={humorous ? 'Humorous, a little sarcastic: click for a straight voice' : 'Write it with a wry, sarcastic voice (the facts stay exact)'}
      className={`${className} ${humorous ? 'border-amber-400/40 bg-amber-400/10 text-amber-200 hover:text-amber-100' : ''}`}
    >
      <MaskHappy size={14} weight={humorous ? 'fill' : 'regular'} />
      Humorous
    </button>
  )
}
