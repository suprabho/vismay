'use client'

/**
 * Floating context menu for the canvas's "+ add" affordance.
 *
 * One component, three modes (driven by `target.kind`):
 *   - `layer`       — pick a VizModule type to append to a slot (background
 *                     or a foreground region/flat stack)
 *   - `region`      — type a new region key (or pick from layout suggestions)
 *   - `override`    — confirm seeding a missing per-section override
 *
 * Rendered into a React portal anchored at `{x, y}` (cursor on the right-
 * click). Click outside / Escape closes; selection callback runs on click.
 *
 * Visual language matches the rest of the canvas: dark panel, monospace
 * type codes, blue accent on hover, no animations.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/* ─── Friendly labels for layer types ───────────────────────────── */

// Same mapping as canvasInputs.layerLabel — duplicated so the menu can
// list types we don't yet have a leaf-rendered label for (e.g. fs:* types
// that fall through to the raw type string). Kept identical so what the
// user sees in the picker matches what they'll see in the resulting leaf.
const TYPE_LABELS: Record<string, string> = {
  map: 'Map',
  image: 'Image',
  chart: 'Chart',
  text: 'Text',
  embed: 'Embed',
  video: 'Video',
  rive: 'Rive',
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type
}

// Optional one-line hint. Steered toward the user's likely first action
// per type — map opens a visual picker, image opens an asset picker, the
// rest land in YAML. Vertical types get a generic hint.
function typeHint(type: string): string {
  switch (type) {
    case 'map':
      return 'Opens map picker'
    case 'image':
      return 'Opens asset picker'
    case 'chart':
    case 'text':
    case 'embed':
    case 'video':
    case 'rive':
      return 'Opens YAML editor'
    default:
      // Vertical-scoped modules (fs:*, f1:*) — we don't know if they have
      // a dedicated editor; the default landing surface is YAML.
      return 'Opens YAML editor'
  }
}

/* ─── Target descriptors ────────────────────────────────────────── */

/** What "+ add" target this menu is about. The caller maps the user's
 *  selection back to the right write helper (canvasSlotAdd.*). */
export type AddMenuTarget =
  | {
      kind: 'layer'
      slot: 'background' | 'foreground'
      /** Types the canvas's server-side discovery surfaced for this slot. */
      availableTypes: string[]
      /** Human-readable context (e.g. 'Background', 'Charts region'). */
      label: string
    }
  | {
      kind: 'region'
      /** Region keys the current layout uses; suggested as quick picks. */
      knownKeys: string[]
      /** Region keys already present on this section; greyed-out in suggestions. */
      existingKeys: string[]
      /** Layout name shown in the dialog header. Empty when no layout set. */
      layoutName: string
    }
  | {
      kind: 'override'
      label: string
      /** Drives the message; the caller picks the right seed helper. */
      overrideKind: 'share' | 'slides' | 'report' | 'map' | 'narration'
    }

export type AddMenuChoice =
  | { kind: 'layer'; type: string }
  | { kind: 'region'; key: string }
  | { kind: 'override' }

interface Props {
  /** Viewport coordinates where the menu should anchor (cursor at right-click). */
  position: { x: number; y: number }
  target: AddMenuTarget
  onPick: (choice: AddMenuChoice) => void
  onClose: () => void
}

const MENU_W = 280
const PAD = 8

/**
 * Floating menu portal. Three render paths driven by `target.kind`.
 * Position math clamps to the viewport so an edge-of-screen right-click
 * doesn't push the menu offscreen.
 */
export default function AddMenu({ position, target, onPick, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape. Capture so we beat any in-menu
  // mousedown handlers, but skip when the click is inside the menu itself.
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const el = menuRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Clamp to viewport. Math is rough — measuring exact menu height on first
  // paint is fiddly and inverting on overflow is enough.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080
  const x = Math.min(position.x, vw - MENU_W - PAD)
  // Guess max menu height so the bottom-overflow case flips upward; ~400
  // covers most lists.
  const y = Math.min(position.y, vh - 400 - PAD)

  return createPortal(
    <div
      ref={menuRef}
      onContextMenu={(e) => {
        // Prevent the browser's right-click menu from layering on top
        // when the user right-clicks INSIDE our menu.
        e.preventDefault()
      }}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        width: MENU_W,
        zIndex: 9999,
        background: '#111',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: '#ccc',
        overflow: 'hidden',
      }}
    >
      {target.kind === 'layer' && (
        <LayerPicker target={target} onPick={onPick} />
      )}
      {target.kind === 'region' && (
        <RegionPicker target={target} onPick={onPick} />
      )}
      {target.kind === 'override' && (
        <OverridePicker target={target} onPick={onPick} />
      )}
    </div>,
    document.body
  )
}

/* ─── Layer picker ──────────────────────────────────────────────── */

function LayerPicker({
  target,
  onPick,
}: {
  target: AddMenuTarget & { kind: 'layer' }
  onPick: (choice: AddMenuChoice) => void
}) {
  // Sort: core types first in the canonical viz-engine order, then any
  // vertical-scoped types alphabetically. Matches the registry's
  // listModulesForSlot order for core, which is the same as `core` in
  // registry.ts.
  const CORE_ORDER = ['map', 'image', 'chart', 'text', 'embed', 'video', 'rive']
  const core: string[] = []
  const extras: string[] = []
  for (const t of target.availableTypes) {
    if (CORE_ORDER.includes(t)) core.push(t)
    else extras.push(t)
  }
  core.sort((a, b) => CORE_ORDER.indexOf(a) - CORE_ORDER.indexOf(b))
  extras.sort()

  return (
    <>
      <Header
        title={`Add layer · ${target.label}`}
        subtitle={`${target.availableTypes.length} types available · ${target.slot} slot`}
      />
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 4,
          maxHeight: 360,
          overflowY: 'auto',
        }}
      >
        {core.map((type) => (
          <PickerRow
            key={type}
            label={typeLabel(type)}
            code={type}
            hint={typeHint(type)}
            onClick={() => onPick({ kind: 'layer', type })}
          />
        ))}
        {extras.length > 0 && core.length > 0 && <Separator label="Vertical modules" />}
        {extras.map((type) => (
          <PickerRow
            key={type}
            label={typeLabel(type)}
            code={type}
            hint={typeHint(type)}
            onClick={() => onPick({ kind: 'layer', type })}
          />
        ))}
      </ul>
    </>
  )
}

/* ─── Region picker ─────────────────────────────────────────────── */

function RegionPicker({
  target,
  onPick,
}: {
  target: AddMenuTarget & { kind: 'region' }
  onPick: (choice: AddMenuChoice) => void
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const valid = /^[a-z][a-z0-9_-]*$/.test(value)
  const submit = () => {
    if (valid && !target.existingKeys.includes(value)) {
      onPick({ kind: 'region', key: value })
    }
  }

  const unusedSuggestions = target.knownKeys.filter(
    (k) => !target.existingKeys.includes(k)
  )

  return (
    <>
      <Header
        title="Add region"
        subtitle={
          target.layoutName
            ? `layout: ${target.layoutName}`
            : 'no layout set — region will need a matching layout to render'
        }
      />
      <div style={{ padding: 12 }}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="region key (e.g. sidebar)"
          style={{
            width: '100%',
            background: '#0a0a0a',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            color: '#fff',
            padding: '6px 10px',
            fontSize: 12,
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {value && !valid && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: '#cc6666',
            }}
          >
            Use lowercase letters, digits, hyphens, or underscores. Start
            with a letter.
          </div>
        )}
        {valid && target.existingKeys.includes(value) && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: '#cc6666',
            }}
          >
            Region &lsquo;{value}&rsquo; already exists on this section.
          </div>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!valid || target.existingKeys.includes(value)}
          style={{
            marginTop: 10,
            width: '100%',
            background:
              valid && !target.existingKeys.includes(value) ? '#3a5da0' : '#222',
            color:
              valid && !target.existingKeys.includes(value) ? '#fff' : '#666',
            border: 'none',
            borderRadius: 4,
            padding: '6px 0',
            fontSize: 12,
            cursor:
              valid && !target.existingKeys.includes(value)
                ? 'pointer'
                : 'default',
          }}
        >
          Add region
        </button>
      </div>
      {unusedSuggestions.length > 0 && (
        <>
          <Separator label="Layout-defined regions" />
          <ul style={{ listStyle: 'none', margin: 0, padding: 4 }}>
            {unusedSuggestions.map((key) => (
              <PickerRow
                key={key}
                label={key}
                code={key}
                hint={`from layout ${target.layoutName}`}
                onClick={() => onPick({ kind: 'region', key })}
              />
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/* ─── Override picker ───────────────────────────────────────────── */

function OverridePicker({
  target,
  onPick,
}: {
  target: AddMenuTarget & { kind: 'override' }
  onPick: (choice: AddMenuChoice) => void
}) {
  const labels: Record<typeof target.overrideKind, string> = {
    share: 'Add Share variants',
    slides: 'Add Slides override',
    report: 'Add Report override',
    map: 'Add Map override',
    narration: 'Add Narration override',
  }
  const descs: Record<typeof target.overrideKind, string> = {
    share: 'Seed a per-section entry in share.yaml',
    slides: 'Seed a per-section entry in report.yaml under slides.pages',
    report: 'Seed a per-section entry in report.yaml under report.pages',
    map: 'Seed a per-section entry in map.yaml under overrides',
    narration: 'Seed a per-unit script entry in tts.yaml',
  }
  return (
    <>
      <Header title={labels[target.overrideKind]} subtitle={target.label} />
      <div style={{ padding: 12, lineHeight: 1.5 }}>
        <div style={{ color: '#999', fontSize: 11, marginBottom: 12 }}>
          {descs[target.overrideKind]}. You&rsquo;ll edit the seeded entry
          in the side panel.
        </div>
        <button
          type="button"
          onClick={() => onPick({ kind: 'override' })}
          style={{
            width: '100%',
            background: '#3a5da0',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '6px 0',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Seed &amp; edit
        </button>
      </div>
    </>
  )
}

/* ─── Shared atoms ──────────────────────────────────────────────── */

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid #1f1f1f',
        background: '#0a0a0a',
      }}
    >
      <div style={{ color: '#fff', fontSize: 12, fontWeight: 500 }}>
        {title}
      </div>
      <div style={{ color: '#666', fontSize: 10, marginTop: 2 }}>
        {subtitle}
      </div>
    </div>
  )
}

function Separator({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '6px 12px 2px',
        fontSize: 9,
        color: '#666',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </div>
  )
}

function PickerRow({
  label,
  code,
  hint,
  onClick,
}: {
  label: string
  code: string
  hint: string
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          color: '#ddd',
          padding: '6px 12px',
          textAlign: 'left',
          fontSize: 12,
          fontFamily: 'inherit',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#1a1a1a'
          e.currentTarget.style.color = '#fff'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = '#ddd'
        }}
      >
        <span style={{ flex: 1 }}>{label}</span>
        <span
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 10,
            color: '#666',
          }}
        >
          {code}
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>{hint}</span>
      </button>
    </li>
  )
}
