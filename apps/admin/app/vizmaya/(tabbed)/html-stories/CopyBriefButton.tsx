'use client'

import { useState } from 'react'
import { Check, Copy } from '@phosphor-icons/react'

export function CopyBriefButton({ brief }: { brief: string }) {
  const [copied, setCopied] = useState(false)
  return (
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
  )
}
