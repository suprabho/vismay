'use client'

import dynamic from 'next/dynamic'
import type { EmojiClickData, EmojiStyle, Theme } from 'emoji-picker-react'

// Lazy-load the full picker so its emoji dataset stays out of the initial
// bundle. The enums are imported as types only (erased) so this import is the
// sole runtime reference — Next code-splits it into its own chunk.
const Picker = dynamic(() => import('emoji-picker-react'), {
  ssr: false,
  loading: () => <div className="p-3 text-[11px] text-neutral-500">Loading emojis…</div>,
})

/** Full Unicode emoji picker (search + categories). Calls `onPick` with the
 *  native glyph, which is stored on the emoji element and rendered as-is. */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <div className="overflow-hidden rounded-md">
      <Picker
        onEmojiClick={(e: EmojiClickData) => onPick(e.emoji)}
        theme={'dark' as Theme}
        emojiStyle={'native' as EmojiStyle}
        lazyLoadEmojis
        skinTonesDisabled
        width="100%"
        height={340}
        previewConfig={{ showPreview: false }}
        searchPlaceHolder="Search emoji…"
      />
    </div>
  )
}
