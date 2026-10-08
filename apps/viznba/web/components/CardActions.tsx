'use client'

import { useState, useSyncExternalStore } from 'react'
import { BookmarkSimple, Export } from '@phosphor-icons/react'

const KEY = 'viznba_saved'
const CHANGED = 'viznba-saved-change'

function snapshot(): string {
  try {
    return localStorage.getItem(KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGED, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGED, onChange)
  }
}

function parse(raw: string): string[] {
  try {
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

/** Save (kept in this browser) and Share (native sheet, else copy link). */
export function CardActions({ id, title, url }: { id: string; title: string; url: string | null }) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => '[]')
  const saved = parse(raw).includes(id)
  const [copied, setCopied] = useState(false)

  function toggleSave() {
    const list = parse(snapshot())
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
    try {
      localStorage.setItem(KEY, JSON.stringify(next.slice(-200)))
    } catch {
      /* storage blocked */
    }
    window.dispatchEvent(new Event(CHANGED))
  }

  async function share() {
    const link = url ?? window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title, url: link })
      } catch {
        /* dismissed */
      }
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="flex gap-1">
      <button
        type="button"
        aria-label={saved ? 'Saved' : 'Save'}
        aria-pressed={saved}
        onClick={toggleSave}
        className={`flex size-11 items-center justify-center rounded-full ${saved ? 'text-accent' : 'text-muted hover:text-text'}`}
      >
        <BookmarkSimple size={20} weight={saved ? 'fill' : 'regular'} />
      </button>
      <button
        type="button"
        aria-label={copied ? 'Link copied' : 'Share'}
        onClick={share}
        className="flex size-11 items-center justify-center rounded-full text-muted hover:text-text"
      >
        <Export size={20} />
      </button>
    </div>
  )
}
