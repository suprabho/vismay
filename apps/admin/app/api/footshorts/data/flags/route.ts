import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'

/**
 * Country list for the share-card flag picker — sourced from flagcdn's public
 * code→name map (server-fetched, cached). The client renders the flag image
 * from `https://flagcdn.com/w320/<code>.png` (routed through the image proxy on
 * the card so capture works). Falls back to a small built-in list if flagcdn is
 * unreachable.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FALLBACK: Record<string, string> = {
  ar: 'Argentina', br: 'Brazil', de: 'Germany', es: 'Spain', fr: 'France',
  gb: 'United Kingdom', it: 'Italy', nl: 'Netherlands', pt: 'Portugal', us: 'United States',
}

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const res = await fetch('https://flagcdn.com/en/codes.json', {
      headers: { accept: 'application/json' },
      // Country names change rarely — let the platform cache a day.
      next: { revalidate: 86400 },
    })
    const map = res.ok ? ((await res.json()) as Record<string, string>) : FALLBACK
    // flagcdn includes subdivisions (e.g. "gb-eng"); keep 2-letter country codes.
    const items = Object.entries(map)
      .filter(([code]) => /^[a-z]{2}$/.test(code))
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ ok: true, items })
  } catch {
    const items = Object.entries(FALLBACK).map(([code, name]) => ({ code, name }))
    return NextResponse.json({ ok: true, items })
  }
}
