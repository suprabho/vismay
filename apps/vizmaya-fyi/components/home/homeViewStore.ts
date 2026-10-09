'use client'

import { useSyncExternalStore } from 'react'
import { isHomeView, type HomeView } from '@/lib/home/homeShape'

/**
 * How the reader likes the front page bound: Book, Board, Deck or Scroll.
 * A pick this visit wins, then `?view=` on the URL, then the one remembered
 * from an earlier visit, then the default (a book on wide screens, a deck on
 * phones, where the board is weakest). The server and the first paint render
 * Scroll: the plain list of stories is the fallback every reader gets first.
 */

const KEY = 'vizmaya:home-view'
let picked: HomeView | null = null
const listeners = new Set<() => void>()

function read(): HomeView {
  if (picked) return picked
  const fromUrl = new URLSearchParams(window.location.search).get('view')
  if (isHomeView(fromUrl)) return fromUrl
  try {
    const stored = window.localStorage.getItem(KEY)
    if (isHomeView(stored)) return stored
  } catch {
    // storage blocked: fall through to the default
  }
  return window.matchMedia('(min-width: 720px)').matches ? 'book' : 'deck'
}

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function chooseHomeView(view: HomeView) {
  picked = view
  try {
    window.localStorage.setItem(KEY, view)
  } catch {
    // remembered for this visit only
  }
  listeners.forEach((l) => l())
}

export function useHomeView(): HomeView {
  return useSyncExternalStore(subscribe, read, () => 'scroll')
}
