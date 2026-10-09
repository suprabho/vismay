'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowCounterClockwise,
  ArrowUpRight,
  BookOpen,
  Cards,
  CircleNotch,
  PushPin,
  Rows,
  Warning,
  type Icon,
} from '@phosphor-icons/react'
import { trackTopicFiltered } from '@/lib/analytics'
import {
  FRONT_PAGE_LIMIT,
  HOME_STAGE_MESSAGE,
  HOME_VIEWS,
  HOME_VIEW_META,
  homeStageUrl,
  isHomeStageFormat,
  storiesForTopic,
  storyTopics,
  type HomeStory,
  type HomeView,
} from '@/lib/home/homeShape'
import { chooseHomeView, useHomeView } from './homeViewStore'
import ScrollIndex from './ScrollIndex'

export const VIEW_ICONS: Record<HomeView, Icon> = {
  book: BookOpen,
  board: PushPin,
  deck: Cards,
  scroll: Rows,
}

/** How long a stage gets to bring its runtime up before the page falls back to Scroll. */
const STAGE_TIMEOUT_MS = 12000

/**
 * The swappable section: the front page bound as a Book, a Board or a Deck
 * (each a stage document on the hosted format runtimes, framed here), or as
 * one long Scroll. Scroll is also the fallback: it is what the server renders,
 * what shows when a stage fails to come up in time, and what a reader gets by
 * asking any of the formats to "Read as one page".
 */
export default function FrontPage({ stories }: { stories: HomeStory[] }) {
  const view = useHomeView()
  const [topic, setTopic] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [readyKey, setReadyKey] = useState<string | null>(null)
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const topics = useMemo(() => storyTopics(stories), [stories])
  const bound = useMemo(() => storiesForTopic(stories, topic).slice(0, FRONT_PAGE_LIMIT), [stories, topic])

  const format = isHomeStageFormat(view) ? view : null
  const key = format ? `${format}|${topic ?? ''}|${attempt}` : null
  const status: 'scroll' | 'loading' | 'ready' | 'failed' = !key
    ? 'scroll'
    : failedKey === key
      ? 'failed'
      : readyKey === key
        ? 'ready'
        : 'loading'

  // The stage says when its runtime is on, and when the reader asked it for
  // the one-page view (answered with Scroll, here in the page).
  useEffect(() => {
    if (!key) return
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return
      const d = e.data as { type?: string; event?: string } | null
      if (!d || d.type !== HOME_STAGE_MESSAGE) return
      if (d.event === 'ready') setReadyKey(key)
      else if (d.event === 'linear') chooseHomeView('scroll')
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [key])

  // A stage that never comes up falls back to Scroll.
  useEffect(() => {
    if (status !== 'loading' || !key) return
    const t = window.setTimeout(() => setFailedKey(key), STAGE_TIMEOUT_MS)
    return () => window.clearTimeout(t)
  }, [status, key])

  const pickTopic = useCallback((t: string | null) => {
    setTopic(t)
    trackTopicFiltered(t ?? 'All')
  }, [])

  const label = HOME_VIEW_META[view].label
  const showScroll = status === 'scroll' || status === 'failed'

  return (
    <div>
      {/* Controls: the binding, then the topic */}
      <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div
            role="group"
            aria-label="Read the front page as"
            className="grid grid-cols-4 rounded-[14px] border border-(--line2) bg-(--paper) p-1 shadow-[0_1px_0_rgba(12,12,16,.04)] sm:inline-flex sm:rounded-full"
          >
            {HOME_VIEWS.map((v) => {
              const I = VIEW_ICONS[v]
              const on = v === view
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => chooseHomeView(v)}
                  className={`flex h-14 flex-col items-center justify-center gap-1 rounded-[10px] px-2 font-(family-name:--mono) text-[10px] font-medium uppercase tracking-[.14em] transition-colors sm:h-10 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:text-[11px] ${
                    on ? 'bg-(--ink) text-(--cream)' : 'text-(--muted) hover:text-(--ink)'
                  }`}
                >
                  <I size={17} weight={on ? 'fill' : 'regular'} aria-hidden />
                  <span>{HOME_VIEW_META[v].label}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-[14px] text-(--muted)" aria-live="polite">
            {HOME_VIEW_META[view].hint}
          </p>
        </div>

        {topics.length > 0 && (
          <div
            role="group"
            aria-label="Filter by topic"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 lg:max-w-[52%] lg:justify-end"
          >
            {[null, ...topics].map((t) => {
              const on = t === topic
              return (
                <button
                  key={t ?? 'all'}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickTopic(t)}
                  className={`h-8 flex-none rounded-full border px-3.5 font-(family-name:--mono) text-[10px] uppercase tracking-[.14em] transition-colors ${
                    on ? 'border-(--ink) bg-(--ink) text-(--cream)' : 'border-(--line2) text-(--muted) hover:border-(--ink) hover:text-(--ink)'
                  }`}
                >
                  {t ?? 'All'}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* The stage: a bound format in its frame… */}
      {format && status !== 'failed' && (
        <div className="relative h-[min(860px,calc(100svh-96px))] min-h-[540px] overflow-hidden rounded-[14px] bg-(--ink) shadow-[0_40px_90px_-40px_rgba(12,12,16,.55),0_0_0_1px_rgba(12,12,16,.12)]">
          <iframe
            key={key}
            ref={frameRef}
            src={homeStageUrl(format, topic)}
            title={`The front page, as a ${label.toLowerCase()}`}
            allowFullScreen
            className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
          />
          {status === 'loading' && (
            <div className="absolute inset-0 grid place-items-center text-(--cream)" role="status">
              <span className="flex items-center gap-3 font-(family-name:--mono) text-[11px] uppercase tracking-[.2em] text-[rgba(244,241,236,.7)]">
                <CircleNotch size={18} className="animate-spin motion-reduce:animate-none" aria-hidden />
                Binding the {label.toLowerCase()}…
              </span>
            </div>
          )}
        </div>
      )}

      {/* …or one long scroll, which is also the fallback */}
      {showScroll && (
        <div>
          {status === 'failed' && (
            <div
              role="status"
              className="mb-6 flex flex-col gap-3 rounded-[8px] border border-(--line2) bg-(--paper) px-4 py-3 text-[14px] text-(--muted) sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex items-center gap-2">
                <Warning size={18} className="flex-none text-(--pink)" aria-hidden />
                The {label.toLowerCase()} didn’t open, so here is the front page as one long scroll.
              </span>
              <button
                type="button"
                onClick={() => setAttempt((a) => a + 1)}
                className="inline-flex flex-none items-center gap-2 font-(family-name:--mono) text-[11px] uppercase tracking-[.16em] text-(--ink) hover:text-(--teal)"
              >
                <ArrowCounterClockwise size={14} weight="bold" aria-hidden /> Try again
              </button>
            </div>
          )}
          <ScrollIndex stories={bound} total={stories.length} />
        </div>
      )}

      {!showScroll && (
        <div className="mt-5 flex flex-col gap-3 text-[14px] text-(--muted) sm:flex-row sm:items-center sm:justify-between">
          <p>
            {bound.length} {bound.length === 1 ? 'story' : 'stories'}
            {topic ? ` on ${topic}` : ''}, bound as a {label.toLowerCase()}. Prefer to scroll?{' '}
            <button
              type="button"
              onClick={() => chooseHomeView('scroll')}
              className="text-(--ink) underline decoration-(--teal) decoration-2 underline-offset-4 hover:text-(--teal)"
            >
              Read it as one page
            </button>
            .
          </p>
          <Link
            href="/stories"
            className="inline-flex items-center gap-2 font-(family-name:--mono) text-[11px] uppercase tracking-[.18em] text-(--ink) underline-offset-4 hover:underline"
          >
            All {stories.length} stories <ArrowUpRight size={14} weight="bold" />
          </Link>
        </div>
      )}
    </div>
  )
}
