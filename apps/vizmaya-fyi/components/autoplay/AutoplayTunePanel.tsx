'use client'

interface CueRecord {
  unit_index: number
  chunk_index: number
  start_ms: number
  end_ms: number
}

interface Props {
  /** The currently visible unit (post desktop→mobile mapping for 16:9). */
  activeUnit: number
  /** The mobile-cue index this visible unit is bound to, or undefined. */
  mobileIdx: number | undefined
  /** The base cues from DB (without overrides applied). */
  baseCues: CueRecord[]
  /** Local override map. */
  overrides: Map<number, CueRecord>
  /** Number of unsaved overrides. */
  dirtyCount: number
  saving: boolean
  saveError: string | null
  onSave: () => void
  onReset: () => void
}

/**
 * Floating panel for fine-tuning cue boundaries during playback. Keyboard
 * `[` `]` shifts the boundary by 100ms (Shift for 25ms). The panel itself
 * doesn't own the nudge behaviour — `AutoplayShell` does — it only displays
 * the active cue's timing and exposes save/reset.
 */
export default function AutoplayTunePanel({
  activeUnit,
  mobileIdx,
  baseCues,
  overrides,
  dirtyCount,
  saving,
  saveError,
  onSave,
  onReset,
}: Props) {
  const base = mobileIdx !== undefined ? baseCues.find((c) => c.unit_index === mobileIdx) : undefined
  const live = mobileIdx !== undefined ? overrides.get(mobileIdx) : undefined
  const cur = live ?? base
  const delta = base && live ? live.start_ms - base.start_ms : 0

  return (
    <div
      className="fixed left-4 bottom-20 z-40 rounded-md border font-[family-name:var(--font-mono)]"
      style={{
        background: 'var(--color-chrome-bg)',
        borderColor: 'rgba(255,255,255,0.08)',
        color: 'var(--color-chrome-text)',
        minWidth: 260,
      }}
    >
      <div
        className="px-3 py-2 border-b text-[0.6rem] uppercase tracking-wider"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          color: 'var(--color-chrome-text-dim)',
        }}
      >
        Tune cues
      </div>

      <div className="px-3 py-2 text-[0.7rem] leading-relaxed">
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-chrome-text-dim)' }}>visible unit</span>
          <span>{activeUnit + 1}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--color-chrome-text-dim)' }}>cue index</span>
          <span>{mobileIdx ?? '—'}</span>
        </div>
        {cur ? (
          <>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-chrome-text-dim)' }}>chunk</span>
              <span>{cur.chunk_index}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-chrome-text-dim)' }}>start</span>
              <span>
                {(cur.start_ms / 1000).toFixed(2)}s
                {delta !== 0 && (
                  <span
                    className="ml-2"
                    style={{ color: delta > 0 ? 'var(--color-accent)' : '#ff6b6b' }}
                  >
                    {delta > 0 ? '+' : ''}
                    {delta}ms
                  </span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--color-chrome-text-dim)' }}>end</span>
              <span>{(cur.end_ms / 1000).toFixed(2)}s</span>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--color-chrome-text-dim)' }}>no cue at this unit</div>
        )}
      </div>

      <div
        className="px-3 py-2 border-t text-[0.6rem] leading-relaxed"
        style={{
          borderColor: 'rgba(255,255,255,0.08)',
          color: 'var(--color-chrome-text-dim)',
        }}
      >
        <div>
          <kbd style={{ color: 'var(--color-chrome-text)' }}>[</kbd> /{' '}
          <kbd style={{ color: 'var(--color-chrome-text)' }}>]</kbd> shift ±100ms
        </div>
        <div>
          <kbd>shift</kbd> + key for ±25ms
        </div>
        <div>
          <kbd>esc</kbd> exits ·{' '}
          <kbd>{navigator?.platform?.startsWith('Mac') ? '⌘' : 'ctrl'}+s</kbd>{' '}
          saves
        </div>
      </div>

      {saveError && (
        <div className="px-3 py-2 text-[0.65rem]" style={{ color: '#ff6b6b' }}>
          {saveError}
        </div>
      )}

      <div
        className="px-3 py-2 border-t flex items-center justify-end gap-2"
        style={{ borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <button
          onClick={onReset}
          disabled={dirtyCount === 0 || saving}
          className="px-3 py-1 rounded text-[0.65rem] uppercase tracking-wider transition-opacity disabled:opacity-30"
          style={{ color: 'var(--color-chrome-text)' }}
        >
          Reset
        </button>
        <button
          onClick={onSave}
          disabled={dirtyCount === 0 || saving}
          className="px-3 py-1 rounded text-[0.65rem] uppercase tracking-wider transition-opacity disabled:opacity-40"
          style={{
            background: 'var(--color-accent)',
            color: '#fff',
          }}
        >
          {saving ? 'Saving…' : `Save${dirtyCount > 0 ? ` ${dirtyCount}` : ''}`}
        </button>
      </div>
    </div>
  )
}
