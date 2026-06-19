'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FixtureRow, StandingRow, FixtureEvent } from '@vismay/footshorts-viz/types'
import type { ComposerLayer } from '@vismay/viz-admin'
import type { AspectRatio, NewsItem } from '../types'
import type { CompMeta, FootshortsCardData } from '../modules/dataContext'
import { compKeyOf, type CompetitionOption } from './ctx'

/**
 * Multi-competition data manager for the footshorts composer. Generalizes the
 * old single-competition fetch effects: it reads which competitions / fixtures /
 * news the current layers reference and fetches each ONCE (cached by key), then
 * exposes everything as the `FootshortsCardData` the host injects via
 * `FootshortsDataProvider`. The picker editors and the card modules both read
 * from this one store.
 */

function usedCompKeys(layers: ComposerLayer[]): string[] {
  const set = new Set<string>()
  for (const l of layers) {
    const k = l.layer.compKey
    if (typeof k === 'string' && k) set.add(k)
  }
  return Array.from(set)
}

function usedEventFixtureIds(layers: ComposerLayer[]): string[] {
  const set = new Set<string>()
  for (const l of layers) {
    if (l.layer.type === 'fscard:match-timeline') {
      const id = l.layer.fixtureId
      if (typeof id === 'string' && id) set.add(id)
    }
  }
  return Array.from(set)
}

function wantsNews(layers: ComposerLayer[]): boolean {
  return layers.some(
    (l) => l.layer.type === 'fscard:news-image' || l.layer.type === 'fscard:news-article',
  )
}

async function fetchRows<T>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url)
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; rows?: T[] }
    if (!res.ok || !body.ok) return []
    return body.rows ?? []
  } catch {
    return []
  }
}

export function useFootshortsCardData({
  layers,
  competitions,
  ratio,
  newsLimit = 40,
}: {
  layers: ComposerLayer[]
  competitions: CompetitionOption[]
  ratio: AspectRatio
  newsLimit?: number
}): FootshortsCardData {
  const [fixturesByComp, setFixturesByComp] = useState<Record<string, FixtureRow[]>>({})
  const [standingsByComp, setStandingsByComp] = useState<Record<string, StandingRow[]>>({})
  const [eventsByFixture, setEventsByFixture] = useState<Record<string, FixtureEvent[]>>({})
  const [news, setNews] = useState<NewsItem[]>([])

  // One-shot guards so each resource is fetched at most once per key.
  const fetchedFixtures = useRef(new Set<string>())
  const fetchedStandings = useRef(new Set<string>())
  const fetchedEvents = useRef(new Set<string>())
  const fetchedNewsLimit = useRef(0)

  const compByKey = useMemo(
    () => new Map(competitions.map((c) => [compKeyOf(c), c])),
    [competitions],
  )

  const compKeys = usedCompKeys(layers)
  const compKeysKey = compKeys.join('|')
  const eventIds = usedEventFixtureIds(layers)
  const eventIdsKey = eventIds.join('|')
  const needNews = wantsNews(layers)

  // Fixtures + standings per referenced competition.
  useEffect(() => {
    let alive = true
    for (const key of compKeys) {
      const comp = compByKey.get(key)
      if (!comp) continue
      const qs = `competition=${encodeURIComponent(comp.slug)}&season=${encodeURIComponent(comp.season)}`
      if (!fetchedFixtures.current.has(key)) {
        fetchedFixtures.current.add(key)
        void fetchRows<FixtureRow>(`/api/footshorts/data/fixtures?${qs}`).then((rows) => {
          if (alive) setFixturesByComp((m) => ({ ...m, [key]: rows }))
        })
      }
      if (!fetchedStandings.current.has(key)) {
        fetchedStandings.current.add(key)
        void fetchRows<StandingRow>(`/api/footshorts/data/standings?${qs}`).then((rows) => {
          if (alive) setStandingsByComp((m) => ({ ...m, [key]: rows }))
        })
      }
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compKeysKey, compByKey])

  // Events per referenced match-timeline fixture.
  useEffect(() => {
    let alive = true
    for (const id of eventIds) {
      if (fetchedEvents.current.has(id)) continue
      fetchedEvents.current.add(id)
      void fetchRows<FixtureEvent>(
        `/api/footshorts/data/events?fixtureId=${encodeURIComponent(id)}`,
      ).then((rows) => {
        if (alive) setEventsByFixture((m) => ({ ...m, [id]: rows }))
      })
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventIdsKey])

  // News feed (global) when any news layer is present.
  useEffect(() => {
    if (!needNews || fetchedNewsLimit.current >= newsLimit) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/footshorts/data/news?limit=${newsLimit}`)
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: NewsItem[] }
        if (alive && res.ok && body.ok) {
          setNews(body.items ?? [])
          fetchedNewsLimit.current = newsLimit
        }
      } catch {
        /* leave news empty on failure */
      }
    })()
    return () => {
      alive = false
    }
  }, [needNews, newsLimit])

  const compMeta = useMemo(() => {
    const m: Record<string, CompMeta> = {}
    for (const c of competitions) {
      const key = compKeyOf(c)
      m[key] = { compKey: key, name: c.name, season: c.season }
    }
    return m
  }, [competitions])

  return useMemo<FootshortsCardData>(
    () => ({ compMeta, fixturesByComp, standingsByComp, eventsByFixture, news, ratio }),
    [compMeta, fixturesByComp, standingsByComp, eventsByFixture, news, ratio],
  )
}
