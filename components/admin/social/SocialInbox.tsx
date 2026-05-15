'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { YoutubeLogo, LinkedinLogo, XLogo, ArrowSquareOut } from '@phosphor-icons/react'
import {
  PLATFORMS,
  STATUSES,
  type EngagementEvent,
  type EngagementSummary,
  type Platform,
  type Status,
} from '@/lib/socialEngagement'

interface Resp {
  events: EngagementEvent[]
  summary: EngagementSummary
}

const PLATFORM_ICONS: Record<Platform, React.ComponentType<{ size?: number; weight?: 'fill' | 'regular' }>> = {
  youtube: YoutubeLogo,
  linkedin: LinkedinLogo,
  x: XLogo,
}

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  x: 'X',
}

const STATUS_LABELS: Record<Status, string> = {
  new: 'New',
  seen: 'Seen',
  replied: 'Replied',
  dismissed: 'Dismissed',
}

export function SocialInbox() {
  const [events, setEvents] = useState<EngagementEvent[]>([])
  const [summary, setSummary] = useState<EngagementSummary | null>(null)
  const [platformFilter, setPlatformFilter] = useState<Set<Platform>>(new Set())
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set(['new']))
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const latestRequestId = useRef(0)

  useEffect(() => {
    const requestId = ++latestRequestId.current
    setLoading(true)
    const qs = new URLSearchParams()
    if (platformFilter.size > 0) qs.set('platform', [...platformFilter].join(','))
    if (statusFilter.size > 0) qs.set('status', [...statusFilter].join(','))
    const url = `/api/admin/social${qs.toString() ? `?${qs}` : ''}`
    fetch(url)
      .then((r) => r.json())
      .then((data: Resp) => {
        if (requestId !== latestRequestId.current) return
        setEvents(data.events ?? [])
        setSummary(data.summary ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (requestId === latestRequestId.current) setLoading(false)
      })
  }, [platformFilter, statusFilter])

  async function updateStatus(id: string, status: Status) {
    setUpdating(id)
    const res = await fetch(`/api/admin/social/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)))
      if (summary) {
        // Re-fetch summary so the header counts stay accurate.
        fetch('/api/admin/social?status=new')
          .then((r) => r.json())
          .then((d: Resp) => setSummary(d.summary))
          .catch(() => {})
      }
    }
    setUpdating(null)
  }

  function togglePlatform(p: Platform) {
    setPlatformFilter((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  function toggleStatus(s: Status) {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 py-5 border-b border-white/5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Social engagement</h1>
            <p className="text-sm text-neutral-400 mt-0.5 tabular-nums">
              {summary
                ? `${summary.total} total, ${summary.newCount} new`
                : 'loading…'}
            </p>
          </div>
          {summary && (
            <div className="flex items-center gap-3 text-xs text-neutral-500 tabular-nums">
              {PLATFORMS.map((p) => {
                const Icon = PLATFORM_ICONS[p]
                return (
                  <span key={p} className="flex items-center gap-1">
                    <Icon size={14} />
                    {summary.byPlatform[p]}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-neutral-500 mr-1">Platform</span>
          {PLATFORMS.map((p) => {
            const Icon = PLATFORM_ICONS[p]
            const active = platformFilter.has(p)
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlatform(p)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                  active
                    ? 'bg-white/10 text-white border-white/20'
                    : 'text-neutral-400 border-white/5 hover:text-white hover:border-white/15'
                }`}
              >
                <Icon size={12} />
                {PLATFORM_LABELS[p]}
              </button>
            )
          })}
          <span className="text-xs uppercase tracking-wider text-neutral-500 mx-2">Status</span>
          {STATUSES.map((s) => {
            const active = statusFilter.has(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  active
                    ? 'bg-white/10 text-white border-white/20'
                    : 'text-neutral-400 border-white/5 hover:text-white hover:border-white/15'
                }`}
              >
                {STATUS_LABELS[s]}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
          Loading events…
        </div>
      ) : events.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm px-8 text-center">
          No engagement events match the current filters.
        </div>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-white/5">
          {events.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              busy={updating === e.id}
              onStatusChange={(s) => updateStatus(e.id, s)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function EventRow({
  event,
  busy,
  onStatusChange,
}: {
  event: EngagementEvent
  busy: boolean
  onStatusChange: (s: Status) => void
}) {
  const Icon = PLATFORM_ICONS[event.platform]
  const timeAgo = useTimeAgo(event.created_at)
  return (
    <li className={`px-4 py-4 hover:bg-white/[0.02] transition-colors ${event.status === 'new' ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 pt-0.5 text-neutral-400">
          <Icon size={16} weight="fill" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium text-neutral-200 truncate">
              {event.author_handle ?? 'Unknown'}
            </span>
            <span className="text-xs text-neutral-500 shrink-0">{event.type}</span>
            <span className="text-xs text-neutral-600 shrink-0">·</span>
            <span className="text-xs text-neutral-500 shrink-0 tabular-nums">{timeAgo}</span>
          </div>
          {event.content && (
            <p className="text-sm text-neutral-300 mt-1 line-clamp-3 whitespace-pre-wrap">
              {event.content}
            </p>
          )}
          {event.parent_content && (
            <div className="mt-1.5 text-xs text-neutral-500 line-clamp-1">
              on:{' '}
              {event.parent_url ? (
                <a
                  href={event.parent_url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-neutral-300"
                >
                  {event.parent_content}
                </a>
              ) : (
                event.parent_content
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {event.source_url && (
            <a
              href={event.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-neutral-400 hover:text-white p-1"
              title="View on platform"
            >
              <ArrowSquareOut size={16} />
            </a>
          )}
          <select
            value={event.status}
            disabled={busy}
            onChange={(e) => onStatusChange(e.target.value as Status)}
            className="text-xs bg-neutral-900 border border-white/10 rounded px-2 py-1 text-neutral-300 cursor-pointer disabled:opacity-50"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </li>
  )
}

function useTimeAgo(iso: string): string {
  return useMemo(() => formatTimeAgo(new Date(iso)), [iso])
}

function formatTimeAgo(d: Date): string {
  const diffMs = Date.now() - d.getTime()
  const sec = Math.max(0, Math.floor(diffMs / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(mo / 12)}y`
}
