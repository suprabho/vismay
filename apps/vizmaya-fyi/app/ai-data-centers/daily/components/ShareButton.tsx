'use client'

import { useState } from 'react'

/** Copies the edition's canonical URL (the date URL, never the /daily alias). */
export default function ShareButton({ url }: { url: string }) {
  const [label, setLabel] = useState('Share')
  return (
    <button
      className="pill share"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setLabel('Link copied')
        } catch {
          setLabel('Copy failed')
        }
        setTimeout(() => setLabel('Share'), 1600)
      }}
      aria-label="Copy a link to this edition"
    >
      <span className="txt">{label}</span>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2.5v6.5M5.2 5.3 8 2.5l2.8 2.8" />
        <path d="M3.5 8v3.2a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V8" />
      </svg>
    </button>
  )
}
