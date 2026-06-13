'use client'

import { useState } from 'react'

export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(markdown)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
    >
      {copied ? 'Copied' : 'Copy markdown'}
    </button>
  )
}
