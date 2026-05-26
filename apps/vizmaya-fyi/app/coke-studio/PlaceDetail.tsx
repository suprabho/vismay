'use client'

import { useEffect, useMemo, useState } from 'react'
import DetailSheet from '@/components/DetailSheet'
import type {
  CokeStudioPlaceProfile,
  CokeStudioSongMention,
} from '@/lib/coke-studio/data'
import { pinColorFor, type CokeStudioTheme } from './theme'

interface Props {
  canonical: string
  onClose: () => void
  theme: CokeStudioTheme
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: CokeStudioPlaceProfile }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }

// Parent re-mounts this with key={canonical} so each place starts in 'loading'
// without needing an effect-side reset.
export default function PlaceDetail({ canonical, onClose, theme }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch(`/api/coke-studio/place/${encodeURIComponent(canonical)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState({ kind: 'missing' })
          return
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as CokeStudioPlaceProfile
        if (!cancelled) setState({ kind: 'ready', data })
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: 'error', message: String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [canonical])

  return (
    <DetailSheet>
      <Header
        title={state.kind === 'ready' ? titleCase(state.data.canonical) : titleCase(canonical)}
        subtitle={state.kind === 'ready' ? subtitleFor(state.data) : null}
        accentColor={state.kind === 'ready' ? pinColorFor(theme, state.data.type) : theme.accent}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
        {state.kind === 'loading' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">Loading place…</p>
        )}
        {state.kind === 'error' && (
          <p className="text-xs font-mono text-rose-400 mt-3">
            Failed to load: {state.message}
          </p>
        )}
        {state.kind === 'missing' && (
          <p className="text-xs font-mono text-zinc-500 mt-3">
            No record for this place.
          </p>
        )}
        {state.kind === 'ready' && <Profile data={state.data} theme={theme} />}
      </div>
    </DetailSheet>
  )
}

function Header({
  title,
  subtitle,
  accentColor,
  onClose,
}: {
  title: string
  subtitle: string | null
  accentColor: string
  onClose: () => void
}) {
  return (
    <div
      className="px-4 pt-3 pb-3 flex items-start justify-between gap-2 shrink-0"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--vmy-bone) 8%, transparent)' }}
    >
      <div className="min-w-0">
        <p
          className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1 flex items-center gap-1.5"
          style={{ color: 'var(--vmy-ember)' }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: accentColor }}
          />
          Coke Studio Pakistan
        </p>
        <h2
          className="text-lg leading-snug truncate"
          style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className="text-[11px] font-mono mt-0.5"
            style={{ color: 'color-mix(in srgb, var(--vmy-bone) 55%, transparent)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="text-lg leading-none shrink-0 hover:text-white"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
      >
        ×
      </button>
    </div>
  )
}

function Profile({ data, theme }: { data: CokeStudioPlaceProfile; theme: CokeStudioTheme }) {
  const songs = useMemo(() => groupBySong(data.mentions), [data.mentions])
  const topContext = data.contextBreakdown[0]?.type ?? null

  return (
    <>
      {(data.notes || data.aliases) && (
        <div
          className="text-sm leading-relaxed mt-3 space-y-1.5"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 80%, transparent)' }}
        >
          {data.notes && <p>{data.notes}</p>}
          {data.aliases && (
            <p
              className="text-[11px] font-mono"
              style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
            >
              Also known as: {data.aliases}
            </p>
          )}
        </div>
      )}

      <Tiles data={data} topContext={topContext} />

      {data.contextBreakdown.length > 0 && (
        <Block title="Context" subtitle="How the place is invoked across the corpus">
          <div className="flex flex-wrap gap-1.5">
            {data.contextBreakdown.map((c) => (
              <span
                key={c.type}
                className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full"
                style={{
                  background: 'color-mix(in srgb, var(--vmy-bone) 5%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--vmy-bone) 10%, transparent)',
                  color: 'color-mix(in srgb, var(--vmy-bone) 80%, transparent)',
                }}
              >
                <span style={{ color: theme.accentHi }}>{c.count}</span>{' '}
                {c.type}
              </span>
            ))}
          </div>
        </Block>
      )}

      <Block
        title="Songs"
        subtitle={`${data.songCount} ${data.songCount === 1 ? 'song' : 'songs'} · ${data.mentionCount} ${data.mentionCount === 1 ? 'mention' : 'mentions'}`}
      >
        <div className="space-y-3">
          {songs.map((s) => (
            <SongCard key={s.songId} song={s} theme={theme} />
          ))}
        </div>
      </Block>

      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 30%, transparent)' }}
      >
        Place mentions extracted from official lyrics with Claude Sonnet 4.6.
        Lyric snippets reproduced as fair-use quotation; source song rights
        belong to the original artists and Coke Studio Pakistan.
      </p>
    </>
  )
}

function Tiles({
  data,
  topContext,
}: {
  data: CokeStudioPlaceProfile
  topContext: string | null
}) {
  const tiles: { label: string; value: string; suffix?: string }[] = [
    { label: 'Mentions', value: data.mentionCount.toLocaleString() },
    { label: 'Songs', value: data.songCount.toLocaleString() },
    {
      label: 'Type',
      value: titleCase(data.type),
    },
    {
      label: 'Top context',
      value: topContext ? titleCase(topContext) : '—',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-md px-3 py-2"
          style={{
            background: 'color-mix(in srgb, var(--vmy-bone) 4%, transparent)',
            border: '1px solid color-mix(in srgb, var(--vmy-bone) 6%, transparent)',
          }}
        >
          <div
            className="text-[9px] font-mono uppercase tracking-[0.18em]"
            style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
          >
            {t.label}
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span
              className="text-base leading-none truncate"
              style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}
            >
              {t.value}
            </span>
            {t.suffix && (
              <span
                className="text-[10px] font-mono"
                style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
              >
                {t.suffix}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function Block({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-xs" style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}>
          {title}
        </p>
        <p
          className="text-[10px] font-mono"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
        >
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  )
}

interface GroupedSong {
  songId: string
  songTitle: string
  songTitleNative: string | null
  season: number
  episode: number | null
  artists: string | null
  youtubeUrl: string | null
  releaseDate: string | null
  mentions: CokeStudioSongMention[]
}

function groupBySong(mentions: CokeStudioSongMention[]): GroupedSong[] {
  // Mentions are pre-sorted by season → episode → track → verse server-side,
  // so this preserves chronological order across songs without re-sorting.
  const map = new Map<string, GroupedSong>()
  for (const m of mentions) {
    let g = map.get(m.songId)
    if (!g) {
      g = {
        songId: m.songId,
        songTitle: m.songTitle,
        songTitleNative: m.songTitleNative,
        season: m.season,
        episode: m.episode,
        artists: m.artists,
        youtubeUrl: m.youtubeUrl,
        releaseDate: m.releaseDate,
        mentions: [],
      }
      map.set(m.songId, g)
    }
    g.mentions.push(m)
  }
  return Array.from(map.values())
}

function SongCard({ song, theme }: { song: GroupedSong; theme: CokeStudioTheme }) {
  const episodeLabel = song.episode != null ? `S${song.season} · E${song.episode}` : `S${song.season}`
  return (
    <div
      className="rounded-md p-3"
      style={{
        background: 'color-mix(in srgb, var(--vmy-bone) 3%, transparent)',
        border: '1px solid color-mix(in srgb, var(--vmy-bone) 7%, transparent)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <p
              className="text-sm leading-tight"
              style={{ color: 'var(--vmy-bone)', fontWeight: 500 }}
            >
              {song.songTitle}
            </p>
            {song.songTitleNative && song.songTitleNative !== song.songTitle && (
              <p
                className="text-xs leading-tight"
                dir={isRtl(song.songTitleNative) ? 'rtl' : 'ltr'}
                style={{ color: 'color-mix(in srgb, var(--vmy-bone) 55%, transparent)' }}
              >
                {song.songTitleNative}
              </p>
            )}
          </div>
          {song.artists && (
            <p
              className="text-[11px] mt-0.5 truncate"
              style={{ color: 'color-mix(in srgb, var(--vmy-bone) 60%, transparent)' }}
            >
              {song.artists}
            </p>
          )}
          <p
            className="text-[10px] font-mono uppercase tracking-[0.18em] mt-0.5"
            style={{ color: 'color-mix(in srgb, var(--vmy-bone) 45%, transparent)' }}
          >
            {episodeLabel}
          </p>
        </div>
        {song.youtubeUrl && (
          <a
            href={song.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded transition-colors"
            style={{
              border: `1px solid ${theme.line}`,
              color: theme.accentHi,
            }}
          >
            ▶ YouTube
          </a>
        )}
      </div>
      <div className="space-y-2 mt-2">
        {song.mentions.map((m) => (
          <LyricQuote key={m.mentionId} mention={m} theme={theme} />
        ))}
      </div>
    </div>
  )
}

function LyricQuote({
  mention,
  theme,
}: {
  mention: CokeStudioSongMention
  theme: CokeStudioTheme
}) {
  if (!mention.lyricContext && !mention.lyricTranslation) {
    // The extractor occasionally drops the context (e.g. for an instrumental
    // refrain) — fall back to the context type tag so the row still says
    // something useful.
    return (
      <p
        className="text-[11px] italic"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 50%, transparent)' }}
      >
        Referenced as {mention.contextType ?? 'context'}
        {mention.languageOfMention ? ` (${mention.languageOfMention})` : ''}.
      </p>
    )
  }
  const ctxRtl = mention.lyricContext ? isRtl(mention.lyricContext) : false
  return (
    <div
      className="pl-2.5"
      style={{ borderLeft: `2px solid ${alpha(theme.accent, 50)}` }}
    >
      {mention.lyricContext && (
        <p
          className="text-[13px] leading-snug"
          dir={ctxRtl ? 'rtl' : 'ltr'}
          style={{
            color: 'color-mix(in srgb, var(--vmy-bone) 88%, transparent)',
            fontStyle: ctxRtl ? 'normal' : 'italic',
          }}
        >
          “{mention.lyricContext}”
        </p>
      )}
      {mention.lyricTranslation && mention.lyricTranslation !== mention.lyricContext && (
        <p
          className="text-[11px] mt-1 leading-snug"
          style={{ color: 'color-mix(in srgb, var(--vmy-bone) 55%, transparent)' }}
        >
          {mention.lyricTranslation}
        </p>
      )}
      <p
        className="text-[9px] font-mono uppercase tracking-wider mt-1"
        style={{ color: 'color-mix(in srgb, var(--vmy-bone) 35%, transparent)' }}
      >
        {[
          mention.contextType,
          mention.languageOfMention,
          mention.confidence === 'low' ? 'low-conf' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  )
}

// ─── helpers ───────────────────────────────────────────────────────────────

const REGION_DISPLAY: Intl.DisplayNames | null = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' })
  } catch {
    return null
  }
})()

function countryName(code: string): string {
  return REGION_DISPLAY?.of(code) ?? code
}

function subtitleFor(p: CokeStudioPlaceProfile): string | null {
  const parts: string[] = []
  if (p.modernCountry) {
    parts.push(countryName(p.modernCountry))
  }
  if (p.historicalPolity) {
    parts.push(p.historicalPolity)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// Arabic / Arabic-supplement / Arabic-presentation-forms ranges. Urdu, Sindhi,
// Punjabi (Shahmukhi), Saraiki, Pashto, Persian, and Arabic all sit in here.
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

function isRtl(s: string): boolean {
  return ARABIC_RE.test(s)
}

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`
