'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { parseFrontmatter } from '@vismay/content-source/frontmatter'
import StorySettingsFields from '@/components/vizmaya/StorySettingsFields'

type EditorialField = 'title' | 'subtitle' | 'byline' | 'date'

export interface StorySettingsPanelProps {
  slug: string
  appSlug: string | null
  format: 'map' | 'deck'
  /** sources.markdown — the canonical frontmatter source, reseeded after every save. */
  markdown: string | null
  /** Whether the deck-defaults editor can open (deck story with ≥1 section). */
  canEditDeckDefaults: boolean
  /** Persist editorial frontmatter fields. Rejects on save failure. */
  onEditorialChange: (patch: Partial<Record<EditorialField, string>>) => Promise<void>
  /** Persist publishing metadata (status/listed/displayOrder). Rejects on failure. */
  onPublishingChange: (
    meta: Partial<{ status: string; listed: boolean; displayOrder: number | null }>
  ) => Promise<void>
  onAppMoved?: (appSlug: string | null) => void
  onOpenDeckDefaults: () => void
  onClose: () => void
}

/**
 * Story-level settings panel for the canvas. Groups the three story-wide
 * surfaces that the section-scoped canvas otherwise hides: editorial
 * frontmatter (title/subtitle/byline/date), publishing settings (App / status /
 * listed / displayOrder — reused from the classic editor via
 * StorySettingsFields), and a trigger for the existing deck-defaults editor.
 *
 * Reads current values from the `markdown` prop; every edit saves immediately
 * through the host callbacks (the canvas has no global Save button).
 */
export default function StorySettingsPanel({
  slug,
  appSlug,
  format,
  markdown,
  canEditDeckDefaults,
  onEditorialChange,
  onPublishingChange,
  onAppMoved,
  onOpenDeckDefaults,
  onClose,
}: StorySettingsPanelProps) {
  const parsed = useMemo(() => parseFrontmatter(markdown ?? ''), [markdown])
  const data = parsed.data
  const frontmatterBroken = parsed.yamlError != null

  const str = (k: string): string => (typeof data[k] === 'string' ? (data[k] as string) : '')

  // Last-saved editorial values — seed the uncontrolled inputs and detect edits.
  const fmTitle = str('title')
  const fmSubtitle = str('subtitle')
  const fmByline = str('byline')
  const fmDate = str('date')

  // Structural, read-only.
  const formatLabel = typeof data.format === 'string' ? (data.format as string) : format
  const vertical = str('vertical')

  // Publishing values (mirror the classic editor's coercions).
  const status = typeof data.status === 'string' ? (data.status as string) : 'published'
  const listed = data.listed !== false
  const displayOrder = typeof data.displayOrder === 'number' ? (data.displayOrder as number) : null

  const [titleError, setTitleError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The App control writes the app_slug DB column, but the canvas derives its
  // links from frontmatter server-side — so a move only fully reflects after a
  // page reload. Surface that instead of silently diverging.
  const [movedHint, setMovedHint] = useState(false)

  // Editorial inputs are uncontrolled (defaultValue + key): the `key` reseeds
  // an input from freshly-saved markdown when its value changes, so there's no
  // local state to sync via effects and typing doesn't re-parse per keystroke.
  async function commitEditorial(field: EditorialField, value: string) {
    setError(null)
    setSaving(true)
    try {
      await onEditorialChange({ [field]: value })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function commitPublishing(
    meta: Partial<{ status: string; listed: boolean; displayOrder: number | null }>
  ) {
    setError(null)
    setSaving(true)
    try {
      await onPublishingChange(meta)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    'w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50'

  return (
    <div
      style={{
        position: 'absolute',
        top: 64,
        left: 16,
        width: 440,
        maxHeight: 'calc(100vh - 96px)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 60,
        background: '#0c0c0c',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 14px',
          borderBottom: '1px solid #1f1f1f',
        }}
      >
        <span style={{ fontSize: 12, color: '#ddd' }}>⚙ Story settings</span>
        {saving && <span style={{ marginLeft: 10, fontSize: 11, color: '#888' }}>Saving…</span>}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            marginLeft: 'auto',
            color: '#888',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 15,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ overflowY: 'auto', padding: 14 }} className="text-white">
        {frontmatterBroken && (
          <div className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            Frontmatter is unparseable — showing defaults. Fix it in the Markdown + Config
            editor before editing story fields here.
          </div>
        )}
        {error && (
          <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Editorial + Publishing are disabled together when frontmatter can't
            be parsed — a save would serialize onto empty data and wipe it. */}
        <fieldset disabled={frontmatterBroken} style={{ border: 0, margin: 0, padding: 0, minInlineSize: 'auto' }}>
          <SectionLabel>Story</SectionLabel>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-2">Title</label>
              <input
                key={fmTitle}
                defaultValue={fmTitle}
                onBlur={(e) => {
                  const v = e.target.value
                  if (v === fmTitle) return
                  // Title is required by the PUT route's markdown validator —
                  // never send an empty one; revert and flag inline instead.
                  if (v.trim() === '') {
                    e.target.value = fmTitle
                    setTitleError('Title is required')
                    return
                  }
                  setTitleError(null)
                  void commitEditorial('title', v)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className={inputClass}
              />
              {titleError && <p className="text-xs text-red-400 mt-1">{titleError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Subtitle</label>
              <input
                key={fmSubtitle}
                defaultValue={fmSubtitle}
                onBlur={(e) => {
                  const v = e.target.value
                  if (v !== fmSubtitle) void commitEditorial('subtitle', v)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Byline</label>
              <input
                key={fmByline}
                defaultValue={fmByline}
                onBlur={(e) => {
                  const v = e.target.value
                  if (v !== fmByline) void commitEditorial('byline', v)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
                className={inputClass}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Date</label>
              <input
                key={fmDate}
                type="date"
                defaultValue={fmDate}
                onBlur={(e) => {
                  const v = e.target.value
                  if (v !== fmDate) void commitEditorial('date', v)
                }}
                className={inputClass}
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-neutral-500 pt-1">
              <span>Format</span>
              <span className="uppercase tracking-wider border border-white/10 rounded px-1.5 py-0.5 text-neutral-300">
                {formatLabel}
              </span>
              {vertical && (
                <>
                  <span>· Vertical</span>
                  <span className="text-neutral-400">{vertical}</span>
                </>
              )}
              <span className="ml-auto text-neutral-600">read-only</span>
            </div>
          </div>

          <SectionLabel className="mt-6">Publishing</SectionLabel>
          <StorySettingsFields
            slug={slug}
            appSlug={appSlug}
            status={status}
            listed={listed}
            displayOrder={displayOrder}
            onChange={commitPublishing}
            onAppMoved={(next) => {
              setMovedHint(true)
              onAppMoved?.(next)
            }}
          />
          {movedHint && (
            <p className="text-xs text-amber-400 mt-2">
              Moved. Reload the canvas to refresh its links and preview.
            </p>
          )}
        </fieldset>

        {canEditDeckDefaults && (
          <>
            <SectionLabel className="mt-6">Deck defaults</SectionLabel>
            <button
              type="button"
              onClick={onOpenDeckDefaults}
              className="w-full text-left bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-neutral-200 hover:bg-white/5"
            >
              Edit deck defaults →
            </button>
            <p className="text-xs text-neutral-500 mt-1">
              Page backdrop, overlay, panel chrome, scroll behaviour, chart theme, progress bar.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function SectionLabel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`text-[10px] uppercase tracking-[0.14em] text-neutral-500 mb-3 ${className}`}
    >
      {children}
    </div>
  )
}
