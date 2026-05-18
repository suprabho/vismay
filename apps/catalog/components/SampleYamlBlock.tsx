'use client'

import { useState } from 'react'

interface Props {
  yaml: string
}

export default function SampleYamlBlock({ yaml }: Props) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(yaml)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard may be blocked; <pre> stays selectable */
    }
  }

  return (
    <div className="rounded border border-[color:var(--color-line)] bg-black/20">
      <div className="flex items-center justify-between border-b border-[color:var(--color-line)] px-3 py-2">
        <span className="text-xs font-mono uppercase tracking-wider text-[color:var(--color-muted)]">
          Sample YAML
        </span>
        <button
          type="button"
          onClick={copy}
          className="text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border border-[color:var(--color-line)] hover:border-[color:var(--color-accent)]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 text-xs font-mono whitespace-pre-wrap text-[color:var(--color-text)] overflow-x-auto">
        {yaml}
      </pre>
    </div>
  )
}
