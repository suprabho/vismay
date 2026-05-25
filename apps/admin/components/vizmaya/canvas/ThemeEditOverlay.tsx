'use client'

/**
 * Right-side panel that hosts the existing ThemeEditor inside the canvas.
 * Mirrors EditorPanel's geometry/styling (slides over the canvas without
 * covering it fully) so iframe updates after save remain visible.
 *
 * Decoupled from EditorPanel because ThemeEditor renders its own scrollable
 * surface + form controls — wrapping it in EditorPanel's Monaco harness would
 * duplicate the title/save header and lose ThemeEditor's spacing.
 */

import { useState } from 'react'
import type { Theme } from '@vismay/viz-engine'
import ThemeEditor from '../ThemeEditor'

interface Props {
  initial: Theme | null
  saving: boolean
  error: string | null
  onSave: (next: Theme) => void
  onClose: () => void
}

export default function ThemeEditOverlay({
  initial,
  saving,
  error,
  onSave,
  onClose,
}: Props) {
  // Local draft so the editor is responsive without round-tripping through
  // a server save on every color pick. The user explicitly hits Save.
  //
  // To re-seed when the user closes + re-opens after an external edit, the
  // parent should pass `key={themeIdentity}` so this component remounts —
  // simpler than a setState-in-effect reset and the linter prefers it.
  const [draft, setDraft] = useState<Theme | null>(initial)

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (draft && dirty) onSave(draft)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      onKeyDown={onKey}
      tabIndex={-1}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(560px, 45vw)',
        background: '#0e0e0e',
        borderLeft: '1px solid #2a2a2a',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <header
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #2a2a2a',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#fff',
            }}
          >
            Theme
            {dirty && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 10,
                  color: '#aaa',
                  fontWeight: 400,
                }}
              >
                · unsaved
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#666',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            Frontmatter
            <span style={{ marginLeft: 10 }}>⌘S save · esc close</span>
          </div>
        </div>
        <button
          onClick={() => draft && onSave(draft)}
          disabled={saving || !dirty || !draft}
          style={{
            background: dirty ? '#2a4d8f' : '#1a1a1a',
            color: dirty ? '#fff' : '#555',
            border: `1px solid ${dirty ? '#3a5da0' : '#2a2a2a'}`,
            borderRadius: 5,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 500,
            cursor: !dirty || saving ? 'default' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            color: '#888',
            border: '1px solid #2a2a2a',
            borderRadius: 5,
            padding: '6px 10px',
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: 'inherit',
            lineHeight: 1,
          }}
          title="Close (esc)"
        >
          ×
        </button>
      </header>

      {error && (
        <div
          style={{
            padding: '10px 16px',
            background: '#3a1a1a',
            color: '#ff8a8a',
            fontSize: 12,
            borderBottom: '1px solid #4a2a2a',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </div>
      )}

      {/* ThemeEditor expects a flex parent that owns scrolling. The panel root
          is already flex column; the dark-on-dark Tailwind classes inside
          ThemeEditor blend with the panel surface visually. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ThemeEditor
          theme={draft ?? undefined}
          onChange={(next) => setDraft(next)}
        />
      </div>
    </div>
  )
}
