'use client'

import { useState } from 'react'

/** Copies the edition's canonical URL (the date URL, never the /daily alias). */
export default function ShareButton({ url }: { url: string }) {
  const [label, setLabel] = useState('Share')
  return (
    <button
      className="pill"
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
        <path d="M6.5 9.5 9.5 6.5M7 4l1.2-1.2a2.5 2.5 0 0 1 3.5 3.5L10.5 7.5M9 12l-1.2 1.2a2.5 2.5 0 0 1-3.5-3.5L5.5 8.5" />
      </svg>
    </button>
  )
}
