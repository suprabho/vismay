'use client'

import { useSyncExternalStore } from 'react'
import { HOME_VIEW_STORAGE_KEY, HOME_WIDE_QUERY, isHomeView, type HomeView } from '@/lib/home/homeShape'

/**
 * How the reader likes the page bound: Book, Board, Deck or Scroll.
 * A pick this visit wins, then `?view=` on the URL, then the one remembered
 * from an earlier visit, then the default (a book on wide screens, a deck on
 * phones, where the board is weakest). The server and the first paint render
 * Scroll: the plain long page is the fallback every reader gets first.
 * HOME_VIEW_BOOT_SCRIPT (homeShape) applies the same precedence before paint.
 */

let picked: HomeView | null = null
const listeners = new Set<() => void>()

function read(): HomeView {
  if (picked) return picked
  const fromUrl = new URLSearchParams(window.location.search).get('view')
  if (isHomeView(fromUrl)) return fromUrl
  try {
    const stored = window.localStorage.getItem(HOME_VIEW_STORAGE_KEY)
    if (isHomeView(stored)) return stored
  } catch {
    // storage blocked: fall through to the default
  }
  return window.matchMedia(HOME_WIDE_QUERY).matches ? 'book' : 'deck'
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** Rebinds the page, remembers the pick and puts it in the URL, so a link keeps it. */
export function chooseHomeView(view: HomeView) {
  picked = view
  try {
    window.localStorage.setItem(HOME_VIEW_STORAGE_KEY, view)
  } catch {
    // remembered for this visit only
  }
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    window.history.replaceState(window.history.state, '', url)
  } catch {
    // the URL just doesn't say
  }
  listeners.forEach((l) => l())
}

export function useHomeView(): HomeView {
  return useSyncExternalStore(subscribe, read, () => 'scroll')
}
