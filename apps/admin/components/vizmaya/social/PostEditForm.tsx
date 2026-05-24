'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ShareCardEntry } from '@vismay/content-source/shareCardList'
import {
  CHANNEL_TEXT_LIMITS,
  isAssetAllowedForChannel,
  type AssetRef,
  type Channel,
  type ShareCardRatio,
  type SocialPostPlan,
  type VideoAspect,
} from '@vismay/content-source/socialPostPlans'
import type { StoryOption } from './PlannerClient'
import { vizmayaUrl } from '@/lib/publicSite'

type AssetKind = AssetRef['kind']

const RATIOS: ShareCardRatio[] = ['1:1', '4:5', '3:4', '4:3']
const VIDEO_ASPECTS: VideoAspect[] = ['9:16', '16:9']

const CHANNEL_LABELS: Record<Channel, string> = {
  x: 'X (Twitter)',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
}

const KIND_LABELS: Record<AssetKind, string> = {
  share_card: 'Single share card',
  share_card_carousel: 'Carousel (multiple share cards)',
  slides_pdf: 'Slides PDF',
  autoplay_video: 'Autoplay video',
}

function allowedKindsFor(channel: Channel): AssetKind[] {
  return (['share_card', 'share_card_carousel', 'slides_pdf', 'autoplay_video'] as AssetKind[]).filter(
    (k) => isAssetAllowedForChannel(channel, k),
  )
}

interface DraftState {
  scheduledDate: string
  scheduledTime: string
  channel: Channel
  storySlug: string
  kind: AssetKind
  cardId: string
  cardIds: string[]
  ratio: ShareCardRatio
  videoAspect: VideoAspect
  postText: string
  status: 'draft' | 'scheduled'
}

function initialDraft(initialDate: string, editing: SocialPostPlan | null): DraftState {
  if (editing) {
    const ref = editing.assetRef
    return {
      scheduledDate: editing.scheduledDate,
      scheduledTime: editing.scheduledTime?.slice(0, 5) ?? '',
      channel: editing.channel,
      storySlug: editing.storySlug ?? '',
      kind: ref.kind,
      cardId: ref.kind === 'share_card' ? ref.cardId : '',
      cardIds: ref.kind === 'share_card_carousel' ? ref.cardIds : [],
      ratio:
        ref.kind === 'share_card' || ref.kind === 'share_card_carousel' ? ref.ratio : '1:1',
      videoAspect: ref.kind === 'autoplay_video' ? ref.aspect : '16:9',
      postText: editing.postText,
      status: editing.status === 'draft' ? 'draft' : 'scheduled',
    }
  }
  return {
    scheduledDate: initialDate,
    scheduledTime: '',
    channel: 'x',
    storySlug: '',
    kind: 'share_card',
    cardId: '',
    cardIds: [],
    ratio: '1:1',
    videoAspect: '16:9',
    postText: '',
    status: 'scheduled',
  }
}

function buildAssetRef(d: DraftState): AssetRef | null {
  if (!d.storySlug) return null
  if (d.kind === 'share_card') {
    if (!d.cardId) return null
    return { kind: 'share_card', slug: d.storySlug, cardId: d.cardId, ratio: d.ratio }
  }
  if (d.kind === 'share_card_carousel') {
    if (d.cardIds.length === 0) return null
    return { kind: 'share_card_carousel', slug: d.storySlug, cardIds: d.cardIds, ratio: d.ratio }
  }
  if (d.kind === 'slides_pdf') return { kind: 'slides_pdf', slug: d.storySlug }
  if (d.kind === 'autoplay_video')
    return { kind: 'autoplay_video', slug: d.storySlug, aspect: d.videoAspect }
  return null
}

export function PostEditForm({
  stories,
  initialDate,
  editing,
  onSaved,
}: {
  stories: StoryOption[]
  initialDate: string
  editing: SocialPostPlan | null
  onSaved: () => void
}) {
  const [draft, setDraft] = useState<DraftState>(() => initialDraft(initialDate, editing))
  const [shareCards, setShareCards] = useState<ShareCardEntry[]>([])
  const [loadingCards, setLoadingCards] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prefilling, setPrefilling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allowedKinds = useMemo(() => allowedKindsFor(draft.channel), [draft.channel])

  useEffect(() => {
    if (!allowedKinds.includes(draft.kind)) {
      setDraft((d) => ({ ...d, kind: allowedKinds[0], cardId: '', cardIds: [] }))
    }
    if (draft.channel === 'x' && draft.kind === 'autoplay_video' && draft.videoAspect !== '16:9') {
      setDraft((d) => ({ ...d, videoAspect: '16:9' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.channel])

  useEffect(() => {
    if (!draft.storySlug) {
      setShareCards([])
      return
    }
    if (draft.kind !== 'share_card' && draft.kind !== 'share_card_carousel') return
    let cancelled = false
    setLoadingCards(true)
    fetch(`/api/vizmaya/social/share-cards/${draft.storySlug}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setShareCards(data as ShareCardEntry[])
      })
      .finally(() => {
        if (!cancelled) setLoadingCards(false)
      })
    return () => {
      cancelled = true
    }
  }, [draft.storySlug, draft.kind])

  async function prefillText() {
    const ref = buildAssetRef(draft)
    if (!ref) return
    setPrefilling(true)
    try {
      const r = await fetch('/api/vizmaya/social/preview-text', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel: draft.channel, assetRef: ref }),
      })
      if (r.ok) {
        const { text } = (await r.json()) as { text: string }
        setDraft((d) => ({ ...d, postText: text }))
      } else {
        const j = await r.json().catch(() => ({}))
        setError((j as { error?: string }).error ?? 'Pre-fill failed')
      }
    } finally {
      setPrefilling(false)
    }
  }

  async function save(asStatus: 'draft' | 'scheduled') {
    setError(null)
    const ref = buildAssetRef(draft)
    if (!ref) {
      setError('Pick a story and asset before saving.')
      return
    }
    if (!draft.scheduledDate) {
      setError('Pick a date.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        scheduledDate: draft.scheduledDate,
        scheduledTime: draft.scheduledTime ? `${draft.scheduledTime}:00` : null,
        channel: draft.channel,
        storySlug: draft.storySlug,
        assetRef: ref,
        postText: draft.postText,
        status: asStatus,
      }
      const url = editing
        ? `/api/vizmaya/social/posts/${editing.id}`
        : '/api/vizmaya/social/posts'
      const method = editing ? 'PATCH' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        setError((j as { error?: string }).error ?? 'Save failed')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const limit = CHANNEL_TEXT_LIMITS[draft.channel]
  const charCount = draft.postText.length
  const overLimit = charCount > limit

  function toggleCarouselCard(id: string) {
    setDraft((d) => {
      const has = d.cardIds.includes(id)
      const next = has ? d.cardIds.filter((x) => x !== id) : [...d.cardIds, id]
      return { ...d, cardIds: next.slice(0, 10) }
    })
  }

  function moveCarouselCard(id: string, dir: -1 | 1) {
    setDraft((d) => {
      const idx = d.cardIds.indexOf(id)
      if (idx < 0) return d
      const next = [...d.cardIds]
      const j = idx + dir
      if (j < 0 || j >= next.length) return d
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return { ...d, cardIds: next }
    })
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={draft.scheduledDate}
              onChange={(e) => setDraft((d) => ({ ...d, scheduledDate: e.target.value }))}
              className="input"
            />
          </Field>
          <Field label="Time (optional)">
            <input
              type="time"
              value={draft.scheduledTime}
              onChange={(e) => setDraft((d) => ({ ...d, scheduledTime: e.target.value }))}
              className="input"
            />
          </Field>
        </div>

        <Field label="Channel">
          <div className="flex gap-2">
            {(['x', 'linkedin', 'youtube'] as Channel[]).map((ch) => (
              <button
                key={ch}
                onClick={() => setDraft((d) => ({ ...d, channel: ch }))}
                className={`px-3 py-1.5 text-sm rounded border ${
                  draft.channel === ch
                    ? 'bg-white/10 text-white border-white/20'
                    : 'border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                {CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Story">
          <select
            value={draft.storySlug}
            onChange={(e) =>
              setDraft((d) => ({ ...d, storySlug: e.target.value, cardId: '', cardIds: [] }))
            }
            className="input"
          >
            <option value="">— Pick a story —</option>
            {stories.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title} {s.status !== 'published' ? `(${s.status})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Asset type">
          <div className="flex flex-wrap gap-2">
            {allowedKinds.map((k) => (
              <button
                key={k}
                onClick={() => setDraft((d) => ({ ...d, kind: k, cardId: '', cardIds: [] }))}
                className={`px-3 py-1.5 text-xs rounded border ${
                  draft.kind === k
                    ? 'bg-white/10 text-white border-white/20'
                    : 'border-white/10 text-neutral-400 hover:text-white'
                }`}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </Field>

        {(draft.kind === 'share_card' || draft.kind === 'share_card_carousel') && (
          <Field label="Aspect ratio">
            <div className="flex gap-2">
              {RATIOS.map((r) => (
                <button
                  key={r}
                  onClick={() => setDraft((d) => ({ ...d, ratio: r }))}
                  className={`px-2.5 py-1 text-xs rounded border ${
                    draft.ratio === r
                      ? 'bg-white/10 text-white border-white/20'
                      : 'border-white/10 text-neutral-400 hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>
        )}

        {draft.kind === 'autoplay_video' && (
          <Field label="Aspect">
            <div className="flex gap-2">
              {VIDEO_ASPECTS.map((a) => {
                const disabled = draft.channel === 'x' && a !== '16:9'
                return (
                  <button
                    key={a}
                    disabled={disabled}
                    onClick={() => setDraft((d) => ({ ...d, videoAspect: a }))}
                    className={`px-2.5 py-1 text-xs rounded border ${
                      draft.videoAspect === a
                        ? 'bg-white/10 text-white border-white/20'
                        : 'border-white/10 text-neutral-400 hover:text-white'
                    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {a}
                  </button>
                )
              })}
            </div>
          </Field>
        )}

        {(draft.kind === 'share_card' || draft.kind === 'share_card_carousel') && draft.storySlug && (
          <Field
            label={
              draft.kind === 'share_card'
                ? 'Pick a card'
                : `Carousel cards (${draft.cardIds.length}/10, drag-free reorder)`
            }
          >
            {loadingCards ? (
              <div className="text-xs text-neutral-500">Loading…</div>
            ) : shareCards.length === 0 ? (
              <div className="text-xs text-neutral-500">No share cards for this story.</div>
            ) : (
              <div className="border border-white/10 rounded max-h-72 overflow-auto divide-y divide-white/5">
                {draft.kind === 'share_card'
                  ? shareCards.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-start gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="card"
                          checked={draft.cardId === c.id}
                          onChange={() => setDraft((d) => ({ ...d, cardId: c.id }))}
                          className="mt-1"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] uppercase text-neutral-500">{c.label}</div>
                          <div className="text-xs text-neutral-200 truncate">{c.preview || c.id}</div>
                        </div>
                      </label>
                    ))
                  : (
                    <>
                      {draft.cardIds.length > 0 && (
                        <div className="bg-white/[0.03]">
                          <div className="px-2 py-1 text-[10px] uppercase text-neutral-500">
                            Selected order
                          </div>
                          {draft.cardIds.map((id, i) => {
                            const c = shareCards.find((x) => x.id === id)
                            return (
                              <div
                                key={id}
                                className="flex items-center gap-2 px-2 py-1.5 border-t border-white/5"
                              >
                                <span className="text-[10px] text-neutral-500 w-4">{i + 1}</span>
                                <span className="text-xs text-neutral-200 truncate flex-1">
                                  {c?.preview || id}
                                </span>
                                <button
                                  onClick={() => moveCarouselCard(id, -1)}
                                  className="text-neutral-500 hover:text-white text-xs"
                                  aria-label="Move up"
                                >
                                  ↑
                                </button>
                                <button
                                  onClick={() => moveCarouselCard(id, 1)}
                                  className="text-neutral-500 hover:text-white text-xs"
                                  aria-label="Move down"
                                >
                                  ↓
                                </button>
                                <button
                                  onClick={() => toggleCarouselCard(id)}
                                  className="text-red-300 hover:bg-red-500/10 px-1 text-xs"
                                  aria-label="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {shareCards.map((c) => {
                        const checked = draft.cardIds.includes(c.id)
                        return (
                          <label
                            key={c.id}
                            className="flex items-start gap-2 px-2 py-1.5 hover:bg-white/5 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCarouselCard(c.id)}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-[10px] uppercase text-neutral-500">{c.label}</div>
                              <div className="text-xs text-neutral-200 truncate">
                                {c.preview || c.id}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </>
                  )}
              </div>
            )}
            {draft.storySlug && (
              <a
                href={vizmayaUrl(`/story/${draft.storySlug}/share`)}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-neutral-500 hover:text-white inline-block mt-1"
              >
                Preview all share cards →
              </a>
            )}
          </Field>
        )}

        <Field
          label={
            <div className="flex items-center justify-between">
              <span>Post text</span>
              <button
                onClick={prefillText}
                disabled={prefilling || !buildAssetRef(draft)}
                className="text-[11px] px-2 py-0.5 border border-white/10 rounded hover:bg-white/5 disabled:opacity-50"
              >
                {prefilling ? 'Pre-filling…' : 'Pre-fill from asset'}
              </button>
            </div>
          }
        >
          <textarea
            value={draft.postText}
            onChange={(e) => setDraft((d) => ({ ...d, postText: e.target.value }))}
            rows={6}
            className="input font-sans"
            placeholder="Write your post, or click 'Pre-fill from asset'."
          />
          <div
            className={`text-[11px] mt-1 ${overLimit ? 'text-red-400' : 'text-neutral-500'}`}
          >
            {charCount} / {limit} chars
          </div>
        </Field>

        {error && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded p-2">
            {error}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 py-3 border-t border-white/5 flex items-center justify-end gap-2">
        <button
          onClick={() => save('draft')}
          disabled={saving}
          className="px-3 py-1.5 text-sm border border-white/10 rounded hover:bg-white/5"
        >
          Save as draft
        </button>
        <button
          onClick={() => save('scheduled')}
          disabled={saving}
          className="px-3 py-1.5 text-sm bg-amber-600/30 text-amber-100 hover:bg-amber-600/40 rounded font-medium"
        >
          {editing ? 'Save changes' : 'Schedule'}
        </button>
      </div>

      <style jsx>{`
        .input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          padding: 6px 8px;
          color: inherit;
          font-size: 13px;
        }
        .input:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.3);
        }
      `}</style>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</div>
      {children}
    </div>
  )
}
