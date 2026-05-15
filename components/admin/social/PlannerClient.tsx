'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { PostComposer } from './PostComposer'
import { PostCard } from './PostCard'
import { PostDetailDrawer } from './PostDetailDrawer'
import type { Channel, SocialPostPlan } from '@/lib/socialPostPlans'

export interface StoryOption {
  slug: string
  title: string
  status: string
  listed: boolean
}

type ViewMode = 'month' | 'week'

const CHANNELS: Channel[] = ['x', 'linkedin', 'youtube']

function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}
function startOfWeek(d: Date): Date {
  const x = new Date(d)
  const dow = x.getDay() // 0 = Sun
  x.setDate(x.getDate() - dow)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}
const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const DAY_LABEL = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const FULL_DAY_LABEL = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

export function PlannerClient({ stories }: { stories: StoryOption[] }) {
  const [view, setView] = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState<Date>(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t
  })
  const [posts, setPosts] = useState<SocialPostPlan[]>([])
  const [loading, setLoading] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerDate, setComposerDate] = useState<string>(ymd(new Date()))
  const [editing, setEditing] = useState<SocialPostPlan | null>(null)
  const [drawerDate, setDrawerDate] = useState<string | null>(null)
  const [openPostId, setOpenPostId] = useState<string | null>(null)

  const range = useMemo(() => {
    if (view === 'month') {
      const first = startOfMonth(anchor)
      const last = endOfMonth(anchor)
      const gridStart = startOfWeek(first)
      const gridEnd = addDays(startOfWeek(last), 6)
      return { from: ymd(gridStart), to: ymd(gridEnd), gridStart, gridEnd }
    }
    const wkStart = startOfWeek(anchor)
    const wkEnd = addDays(wkStart, 6)
    return { from: ymd(wkStart), to: ymd(wkEnd), gridStart: wkStart, gridEnd: wkEnd }
  }, [anchor, view])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(
        `/api/admin/social/posts?from=${range.from}&to=${range.to}`,
      )
      if (r.ok) setPosts((await r.json()) as SocialPostPlan[])
    } finally {
      setLoading(false)
    }
  }, [range.from, range.to])

  useEffect(() => {
    refresh()
  }, [refresh])

  const postsByDay = useMemo(() => {
    const m = new Map<string, SocialPostPlan[]>()
    for (const p of posts) {
      const arr = m.get(p.scheduledDate) ?? []
      arr.push(p)
      m.set(p.scheduledDate, arr)
    }
    return m
  }, [posts])

  const todayKey = ymd(new Date())

  function openNew(dateStr?: string) {
    setEditing(null)
    setComposerDate(dateStr ?? todayKey)
    setComposerOpen(true)
  }

  function openEdit(post: SocialPostPlan) {
    setEditing(post)
    setComposerDate(post.scheduledDate)
    setComposerOpen(true)
  }

  function openDetail(post: SocialPostPlan) {
    setOpenPostId(post.id)
  }

  const openPost = useMemo(
    () => (openPostId ? posts.find((p) => p.id === openPostId) ?? null : null),
    [openPostId, posts]
  )
  const titleForOpen = openPost
    ? openPost.storySlug
      ? stories.find((s) => s.slug === openPost.storySlug)?.title ?? openPost.storySlug
      : '(story removed)'
    : ''

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white/5 rounded-md p-0.5">
          <button
            onClick={() => setView('month')}
            className={`px-3 py-1 text-xs rounded ${
              view === 'month' ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-3 py-1 text-xs rounded ${
              view === 'week' ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Week
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              setAnchor((a) => (view === 'month' ? addMonths(a, -1) : addDays(a, -7)))
            }
            className="px-2 py-1 text-sm border border-white/10 rounded hover:bg-white/5"
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            onClick={() => {
              const t = new Date()
              t.setHours(0, 0, 0, 0)
              setAnchor(t)
            }}
            className="px-2 py-1 text-xs border border-white/10 rounded hover:bg-white/5"
          >
            Today
          </button>
          <button
            onClick={() =>
              setAnchor((a) => (view === 'month' ? addMonths(a, 1) : addDays(a, 7)))
            }
            className="px-2 py-1 text-sm border border-white/10 rounded hover:bg-white/5"
            aria-label="Next"
          >
            ›
          </button>
        </div>
        <div className="text-sm text-neutral-300">
          {view === 'month'
            ? MONTH_LABEL.format(anchor)
            : `${FULL_DAY_LABEL.format(range.gridStart)} – ${FULL_DAY_LABEL.format(range.gridEnd)}`}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {loading && <span className="text-xs text-neutral-500">Loading…</span>}
          <button
            onClick={() => openNew()}
            className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/15 rounded-md font-medium"
          >
            + New post
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {view === 'month' ? (
          <MonthGrid
            gridStart={range.gridStart}
            anchor={anchor}
            postsByDay={postsByDay}
            stories={stories}
            todayKey={todayKey}
            onDayClick={(k) => setDrawerDate(k)}
            onDayPlus={(k) => openNew(k)}
          />
        ) : (
          <WeekGrid
            gridStart={range.gridStart}
            postsByDay={postsByDay}
            stories={stories}
            todayKey={todayKey}
            onPostClick={openDetail}
            onCellPlus={openNew}
          />
        )}
      </div>

      {drawerDate && (
        <DayDrawer
          dateKey={drawerDate}
          posts={postsByDay.get(drawerDate) ?? []}
          stories={stories}
          onClose={() => setDrawerDate(null)}
          onEdit={(p) => {
            setDrawerDate(null)
            openEdit(p)
          }}
          onOpen={(p) => {
            setDrawerDate(null)
            openDetail(p)
          }}
          onNew={() => {
            const d = drawerDate
            setDrawerDate(null)
            openNew(d)
          }}
          onChange={refresh}
        />
      )}

      {openPost && (
        <PostDetailDrawer
          post={openPost}
          storyTitle={titleForOpen}
          onClose={() => setOpenPostId(null)}
          onEdit={() => {
            const p = openPost
            setOpenPostId(null)
            openEdit(p)
          }}
          onChange={refresh}
        />
      )}

      {composerOpen && (
        <PostComposer
          stories={stories}
          initialDate={composerDate}
          editing={editing}
          onClose={() => setComposerOpen(false)}
          onSaved={() => {
            setComposerOpen(false)
            refresh()
          }}
        />
      )}
    </div>
  )
}

function MonthGrid({
  gridStart,
  anchor,
  postsByDay,
  stories,
  todayKey,
  onDayClick,
  onDayPlus,
}: {
  gridStart: Date
  anchor: Date
  postsByDay: Map<string, SocialPostPlan[]>
  stories: StoryOption[]
  todayKey: string
  onDayClick: (k: string) => void
  onDayPlus: (k: string) => void
}) {
  const days: Date[] = []
  for (let i = 0; i < 42; i++) days.push(addDays(gridStart, i))
  const titleFor = (slug: string | null) =>
    slug ? stories.find((s) => s.slug === slug)?.title ?? slug : '(removed)'
  return (
    <div className="p-3">
      <div className="grid grid-cols-7 gap-px bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="bg-neutral-950 px-2 py-1.5 text-[11px] uppercase tracking-wider text-neutral-500 text-center"
          >
            {DAY_LABEL.format(addDays(gridStart, i))}
          </div>
        ))}
        {days.map((d) => {
          const k = ymd(d)
          const inMonth = d.getMonth() === anchor.getMonth()
          const dayPosts = postsByDay.get(k) ?? []
          const visible = dayPosts.slice(0, 3)
          const overflow = dayPosts.length - visible.length
          const isToday = k === todayKey
          return (
            <div
              key={k}
              className={`bg-neutral-950 min-h-[96px] p-1.5 flex flex-col gap-1 cursor-pointer hover:bg-white/[0.02] ${
                inMonth ? '' : 'opacity-40'
              }`}
              onClick={() => onDayClick(k)}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs ${
                    isToday
                      ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-neutral-900 font-semibold'
                      : 'text-neutral-400'
                  }`}
                >
                  {d.getDate()}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDayPlus(k)
                  }}
                  className="text-neutral-600 hover:text-white text-xs px-1"
                  aria-label="Add post"
                >
                  +
                </button>
              </div>
              {visible.map((p) => (
                <ChannelChip
                  key={p.id}
                  post={p}
                  title={titleFor(p.storySlug)}
                />
              ))}
              {overflow > 0 && (
                <div className="text-[10px] text-neutral-500">+{overflow} more</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekGrid({
  gridStart,
  postsByDay,
  stories,
  todayKey,
  onPostClick,
  onCellPlus,
}: {
  gridStart: Date
  postsByDay: Map<string, SocialPostPlan[]>
  stories: StoryOption[]
  todayKey: string
  onPostClick: (p: SocialPostPlan) => void
  onCellPlus: (k: string) => void
}) {
  const titleFor = (slug: string | null) =>
    slug ? stories.find((s) => s.slug === slug)?.title ?? slug : '(removed)'
  const days: Date[] = []
  for (let i = 0; i < 7; i++) days.push(addDays(gridStart, i))
  return (
    <div className="p-3">
      <div className="grid grid-cols-[80px_repeat(7,minmax(0,1fr))] gap-px bg-white/5 border border-white/10 rounded-lg overflow-hidden text-xs">
        <div className="bg-neutral-950 px-2 py-1.5" />
        {days.map((d) => (
          <div
            key={ymd(d)}
            className={`bg-neutral-950 px-2 py-1.5 text-center ${
              ymd(d) === todayKey ? 'text-white font-semibold' : 'text-neutral-500'
            }`}
          >
            <div className="text-[10px] uppercase tracking-wider">{DAY_LABEL.format(d)}</div>
            <div>{d.getDate()}</div>
          </div>
        ))}
        {CHANNELS.map((ch) => (
          <FragmentRow
            key={ch}
            channel={ch}
            days={days}
            postsByDay={postsByDay}
            titleFor={titleFor}
            onPostClick={onPostClick}
            onCellPlus={onCellPlus}
          />
        ))}
      </div>
    </div>
  )
}

function FragmentRow({
  channel,
  days,
  postsByDay,
  titleFor,
  onPostClick,
  onCellPlus,
}: {
  channel: Channel
  days: Date[]
  postsByDay: Map<string, SocialPostPlan[]>
  titleFor: (slug: string | null) => string
  onPostClick: (p: SocialPostPlan) => void
  onCellPlus: (k: string) => void
}) {
  return (
    <>
      <div className="bg-neutral-950 px-2 py-2 flex items-center text-neutral-300 text-xs uppercase tracking-wider">
        {channel}
      </div>
      {days.map((d) => {
        const k = ymd(d)
        const dayPosts = (postsByDay.get(k) ?? []).filter((p) => p.channel === channel)
        return (
          <div
            key={`${channel}-${k}`}
            className="bg-neutral-950 min-h-[64px] p-1.5 flex flex-col gap-1 group"
          >
            {dayPosts.map((p) => (
              <button
                key={p.id}
                onClick={() => onPostClick(p)}
                className="text-left"
              >
                <ChannelChip post={p} title={titleFor(p.storySlug)} />
              </button>
            ))}
            <button
              onClick={() => onCellPlus(k)}
              className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-white text-xs self-end"
              aria-label="Add post"
            >
              +
            </button>
          </div>
        )
      })}
    </>
  )
}

const CHANNEL_COLORS: Record<Channel, string> = {
  x: 'bg-sky-500/15 text-sky-200 border-sky-500/30',
  linkedin: 'bg-blue-600/20 text-blue-200 border-blue-600/30',
  youtube: 'bg-red-500/20 text-red-200 border-red-500/30',
}

function ChannelChip({ post, title }: { post: SocialPostPlan; title: string }) {
  const dim =
    post.status === 'cancelled'
      ? 'opacity-50 line-through'
      : post.status === 'draft'
      ? 'opacity-70 border-dashed'
      : ''
  return (
    <div
      className={`text-[11px] truncate px-1.5 py-0.5 rounded border ${CHANNEL_COLORS[post.channel]} ${dim}`}
      title={`${post.channel} · ${title} · ${post.status}`}
    >
      <span className="uppercase mr-1">{post.channel === 'x' ? 'X' : post.channel === 'linkedin' ? 'in' : 'YT'}</span>
      {title}
    </div>
  )
}

function DayDrawer({
  dateKey,
  posts,
  stories,
  onClose,
  onEdit,
  onOpen,
  onNew,
  onChange,
}: {
  dateKey: string
  posts: SocialPostPlan[]
  stories: StoryOption[]
  onClose: () => void
  onEdit: (p: SocialPostPlan) => void
  onOpen: (p: SocialPostPlan) => void
  onNew: () => void
  onChange: () => void
}) {
  const titleFor = (slug: string | null) =>
    slug ? stories.find((s) => s.slug === slug)?.title ?? slug : '(story removed)'
  const d = new Date(`${dateKey}T00:00:00`)
  return (
    <div
      className="fixed inset-0 z-40 bg-black/40"
      onClick={onClose}
    >
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-neutral-950 border-l border-white/10 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-neutral-500">{FULL_DAY_LABEL.format(d)}</div>
            <div className="text-sm text-neutral-300">
              {posts.length} post{posts.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onNew}
              className="px-2.5 py-1 text-xs bg-white/10 hover:bg-white/15 rounded"
            >
              + New
            </button>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-white text-lg leading-none px-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-2">
          {posts.length === 0 && (
            <div className="text-sm text-neutral-500 py-8 text-center">No posts scheduled.</div>
          )}
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              storyTitle={titleFor(p.storySlug)}
              onEdit={() => onEdit(p)}
              onOpen={() => onOpen(p)}
              onChange={onChange}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

