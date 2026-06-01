'use client'

/**
 * Figma-style right-docked inspector for a single viz layer (foreground or
 * background slot). Replaces the old full-screen SlotFormModal.
 *
 * Three compact sections:
 *   - CONTENT          — the module's `adminForm()` fields, via the shared
 *                        <VizConfigForm> (dark CSS vars scoped locally so it
 *                        blends into the canvas surface).
 *   - POSITION & SIZE  — VizLayerStyle.position / size / opacity / blendMode.
 *   - PANEL            — VizLayerStyle.panel (frosted-glass chrome override);
 *                        off = inherit `defaults.panel`.
 *
 * Geometry mirrors ThemeEditOverlay: absolute, docked right, slides over the
 * canvas so the section iframe stays visible. Local draft + explicit Save
 * (⌘S) + Esc, so we don't re-render the iframe on every keystroke. The parent
 * remounts via `key` to re-seed when the selected slot changes.
 */

import { useMemo, useState } from 'react'
import { getVizModule } from '@vismay/viz-engine'
import VizConfigForm from '../VizConfigForm'

type FormValue = string | number | boolean | object | null | undefined

interface StyleDraft {
  position?: { x?: string; y?: string }
  size?: { width?: string; height?: string }
  opacity?: number
  blendMode?: string
  panel?: Record<string, string>
}

interface Props {
  sectionLabel: string
  layerType: string
  /** On-disk layer object, used to seed the inspector. */
  initialLayer: Record<string, unknown>
  saving: boolean
  error: string | null
  onApply: (next: Record<string, unknown>) => void
  onEditAsYaml: () => void
  onClose: () => void
}

const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'difference']

/* ─── dotted-key shim (bodyText.textStyle.*) — same as the old modal ─── */
function flattenContent(
  layer: Record<string, unknown>,
  schemaKeys: string[]
): Record<string, FormValue> {
  const dottedParents = new Set(
    schemaKeys.filter((k) => k.includes('.')).map((k) => k.split('.')[0])
  )
  const flat: Record<string, FormValue> = {}
  for (const [k, v] of Object.entries(layer)) {
    if (k === 'type' || k === 'style') continue // style is managed separately
    if (dottedParents.has(k) && v != null && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ck, cv] of Object.entries(v as Record<string, unknown>)) {
        flat[`${k}.${ck}`] = cv as FormValue
      }
    } else {
      flat[k] = v as FormValue
    }
  }
  return flat
}

function unflattenContent(value: Record<string, FormValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) {
    const dot = k.indexOf('.')
    if (dot > 0) {
      const parent = k.slice(0, dot)
      const child = k.slice(dot + 1)
      const existing = out[parent]
      const obj =
        existing != null && typeof existing === 'object' && !Array.isArray(existing)
          ? (existing as Record<string, unknown>)
          : {}
      obj[child] = v
      out[parent] = obj
    } else {
      out[k] = v
    }
  }
  return out
}

/** Drop empty strings / undefined; return undefined if nothing remains. */
function prune(obj: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!obj) return undefined
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v == null) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

function cleanStyle(s: StyleDraft): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {}
  const pos = prune(s.position)
  if (pos) out.position = pos
  const size = prune(s.size)
  if (size) out.size = size
  if (typeof s.opacity === 'number' && s.opacity !== 1) out.opacity = s.opacity
  if (s.blendMode && s.blendMode !== 'normal') out.blendMode = s.blendMode
  const panel = prune(s.panel)
  if (panel) out.panel = panel
  return Object.keys(out).length ? out : undefined
}

/* ─── styling tokens (match ThemeEditOverlay's dark surface) ─── */
const COLORS = { surface: '#0e0e0e', line: '#2a2a2a', text: '#e8e8e8', muted: '#888' }
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: `1px solid ${COLORS.line}`,
  borderRadius: 4,
  padding: '5px 7px',
  fontSize: 12,
  color: COLORS.text,
  outline: 'none',
  fontFamily: 'inherit',
}
const labelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: COLORS.muted,
}

export default function SlotInspector({
  sectionLabel,
  layerType,
  initialLayer,
  saving,
  error,
  onApply,
  onEditAsYaml,
  onClose,
}: Props) {
  const vizModule = useMemo(() => getVizModule(layerType), [layerType])
  const schemaKeys = useMemo(
    () => vizModule?.adminForm?.(initialLayer as never)?.map((f) => f.key) ?? [],
    [vizModule, initialLayer]
  )

  const [content, setContent] = useState<Record<string, FormValue>>(() =>
    flattenContent(initialLayer, schemaKeys)
  )
  const [style, setStyle] = useState<StyleDraft>(
    () => ((initialLayer.style as StyleDraft | undefined) ?? {}) as StyleDraft
  )
  const [panelOn, setPanelOn] = useState<boolean>(
    () => !!(initialLayer.style as StyleDraft | undefined)?.panel
  )

  const seed = useMemo(
    () => JSON.stringify({ content: flattenContent(initialLayer, schemaKeys), style: cleanStyle(((initialLayer.style as StyleDraft) ?? {})) }),
    [initialLayer, schemaKeys]
  )
  const current = JSON.stringify({ content, style: cleanStyle(style) })
  const dirty = current !== seed

  const setPos = (axis: 'x' | 'y', v: string) =>
    setStyle((s) => ({ ...s, position: { ...s.position, [axis]: v } }))
  const setSize = (dim: 'width' | 'height', v: string) =>
    setStyle((s) => ({ ...s, size: { ...s.size, [dim]: v } }))
  const setPanel = (k: string, v: string) =>
    setStyle((s) => ({ ...s, panel: { ...s.panel, [k]: v } }))

  const apply = () => {
    const patch: Record<string, unknown> = { ...unflattenContent(content) }
    const cs = cleanStyle(panelOn ? style : { ...style, panel: undefined })
    if (cs) patch.style = cs
    onApply(patch)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault()
      if (dirty) apply()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const hasForm = !!vizModule?.adminForm

  return (
    <div
      onKeyDown={onKey}
      tabIndex={-1}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(360px, 34vw)',
        background: COLORS.surface,
        borderLeft: `1px solid ${COLORS.line}`,
        boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '12px 14px',
          borderBottom: `1px solid ${COLORS.line}`,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#fff' }}>
            {vizModule?.label ?? layerType}
            {dirty && (
              <span style={{ marginLeft: 8, fontSize: 10, color: '#aaa', fontWeight: 400 }}>
                · unsaved
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#666',
              letterSpacing: '0.04em',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {sectionLabel}
          </div>
        </div>
        <button
          onClick={onEditAsYaml}
          title="Edit this slot as YAML"
          style={{
            background: 'transparent',
            color: COLORS.muted,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 5,
            padding: '5px 9px',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          YAML
        </button>
        <button
          onClick={apply}
          disabled={saving || !dirty}
          style={{
            background: dirty ? '#2a4d8f' : '#1a1a1a',
            color: dirty ? '#fff' : '#555',
            border: `1px solid ${dirty ? '#3a5da0' : COLORS.line}`,
            borderRadius: 5,
            padding: '5px 12px',
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
          title="Close (esc)"
          style={{
            background: 'transparent',
            color: COLORS.muted,
            border: `1px solid ${COLORS.line}`,
            borderRadius: 5,
            padding: '5px 9px',
            fontSize: 14,
            lineHeight: 1,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          ×
        </button>
      </header>

      {error && (
        <div
          style={{
            padding: '9px 14px',
            background: '#3a1a1a',
            color: '#ff8a8a',
            fontSize: 11,
            borderBottom: '1px solid #4a2a2a',
            whiteSpace: 'pre-wrap',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* CONTENT — VizConfigForm with dark CSS vars scoped locally so its
            theme-token colors render legibly on the canvas surface. */}
        <Section title="Content">
          {hasForm ? (
            <div
              style={
                {
                  ['--color-line']: COLORS.line,
                  ['--color-text']: COLORS.text,
                  ['--color-muted']: COLORS.muted,
                  ['--color-accent']: '#3a5da0',
                } as React.CSSProperties
              }
            >
              <VizConfigForm
                module={vizModule!}
                value={content}
                onChange={setContent}
                assetRefs={[]}
              />
            </div>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.muted }}>
              No form for <span style={{ fontFamily: 'monospace' }}>{layerType}</span>. Use YAML.
            </div>
          )}
        </Section>

        {/* POSITION & SIZE */}
        <Section title="Position & size">
          <Row>
            <Field label="X">
              <input
                style={inputStyle}
                placeholder="left / center / 10vw"
                value={style.position?.x ?? ''}
                onChange={(e) => setPos('x', e.target.value)}
              />
            </Field>
            <Field label="Y">
              <input
                style={inputStyle}
                placeholder="top / center / 8vh"
                value={style.position?.y ?? ''}
                onChange={(e) => setPos('y', e.target.value)}
              />
            </Field>
          </Row>
          <Row>
            <Field label="W">
              <input
                style={inputStyle}
                placeholder="auto / 40vw"
                value={style.size?.width ?? ''}
                onChange={(e) => setSize('width', e.target.value)}
              />
            </Field>
            <Field label="H">
              <input
                style={inputStyle}
                placeholder="auto / 50vh"
                value={style.size?.height ?? ''}
                onChange={(e) => setSize('height', e.target.value)}
              />
            </Field>
          </Row>
          <Row>
            <Field label="Opacity">
              <input
                type="number"
                min={0}
                max={100}
                style={inputStyle}
                placeholder="100"
                value={typeof style.opacity === 'number' ? Math.round(style.opacity * 100) : ''}
                onChange={(e) => {
                  const n = e.target.value === '' ? undefined : Number(e.target.value)
                  setStyle((s) => ({
                    ...s,
                    opacity: n == null || !Number.isFinite(n) ? undefined : Math.max(0, Math.min(100, n)) / 100,
                  }))
                }}
              />
            </Field>
            <Field label="Blend">
              <select
                style={inputStyle}
                value={style.blendMode ?? 'normal'}
                onChange={(e) =>
                  setStyle((s) => ({ ...s, blendMode: e.target.value === 'normal' ? undefined : e.target.value }))
                }
              >
                {BLEND_MODES.map((m) => (
                  <option key={m} value={m} style={{ background: COLORS.surface }}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </Row>
        </Section>

        {/* PANEL */}
        <Section
          title="Panel"
          right={
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={panelOn}
                onChange={(e) => {
                  setPanelOn(e.target.checked)
                  if (!e.target.checked) setStyle((s) => ({ ...s, panel: undefined }))
                }}
              />
              <span style={{ ...labelStyle, fontSize: 9 }}>override</span>
            </label>
          }
        >
          {panelOn ? (
            <>
              <Row>
                <Field label="Surface">
                  <input
                    style={inputStyle}
                    placeholder="transparent / rgb(…)"
                    value={style.panel?.background ?? ''}
                    onChange={(e) => setPanel('background', e.target.value)}
                  />
                </Field>
                <Field label="Radius">
                  <input
                    style={inputStyle}
                    placeholder="0 / 12px"
                    value={style.panel?.borderRadius ?? ''}
                    onChange={(e) => setPanel('borderRadius', e.target.value)}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Border">
                  <input
                    style={inputStyle}
                    placeholder="none / 1px solid …"
                    value={style.panel?.border ?? ''}
                    onChange={(e) => setPanel('border', e.target.value)}
                  />
                </Field>
                <Field label="Blur">
                  <input
                    style={inputStyle}
                    placeholder="0 / 12px"
                    value={style.panel?.backdropBlur ?? ''}
                    onChange={(e) => setPanel('backdropBlur', e.target.value)}
                  />
                </Field>
              </Row>
              <Row>
                <Field label="Shadow">
                  <input
                    style={inputStyle}
                    placeholder="none / 0 8px 24px …"
                    value={style.panel?.shadow ?? ''}
                    onChange={(e) => setPanel('shadow', e.target.value)}
                  />
                </Field>
                <Field label="Padding">
                  <input
                    style={inputStyle}
                    placeholder="0 / 24px"
                    value={style.panel?.padding ?? ''}
                    onChange={(e) => setPanel('padding', e.target.value)}
                  />
                </Field>
              </Row>
            </>
          ) : (
            <div style={{ fontSize: 11, color: COLORS.muted }}>
              Inherits <span style={{ fontFamily: 'monospace' }}>defaults.panel</span>.
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

/* ─── compact layout primitives ─── */
function Section({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.line}` }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px 4px',
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#777',
            fontWeight: 600,
          }}
        >
          {title}
        </span>
        {right}
      </div>
      <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  )
}
