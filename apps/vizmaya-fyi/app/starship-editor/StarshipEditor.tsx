'use client'

import { useCallback, useMemo, useState } from 'react'
import { ROCKET_MODELS } from '@vismay/starship-viz/types'
import type { RocketModel } from '@vismay/starship-viz/types'
import { EditorScene } from './EditorScene'
import type {
  EditorState,
  MaterialVariant,
  Overrides,
  PartOverride,
} from './types'
import {
  buildDefaultOverrides,
  defaultEditorState,
  defaultPartOverride,
} from './types'

const MATERIAL_VARIANTS: MaterialVariant[] = ['metal', 'black', 'normal', 'wireframe']
const MODELS = Object.keys(ROCKET_MODELS) as RocketModel[]

/**
 * Top-level editor UI: a three-pane layout (sidebar + viewport + inspector)
 * over a single shared `EditorState`. Lives entirely client-side; nothing
 * here ships to the production VizModule.
 */
export default function StarshipEditor() {
  const [state, setState] = useState<EditorState>(() =>
    defaultEditorState('starship', ROCKET_MODELS.starship.partNames),
  )
  // Active model's part list — drives the layer sidebar and Inspector keys.
  const partNames = useMemo(
    () => ROCKET_MODELS[state.model].partNames,
    [state.model],
  )

  const switchModel = useCallback((model: RocketModel) => {
    setState((s) => ({
      ...s,
      model,
      selected: ROCKET_MODELS[model].partNames[0] ?? null,
      solo: null,
      overrides: buildDefaultOverrides(ROCKET_MODELS[model].partNames),
    }))
  }, [])

  const updatePart = useCallback(
    (part: string, patch: Partial<PartOverride>) => {
      setState((s) => {
        const existing = s.overrides[part] ?? defaultPartOverride()
        return {
          ...s,
          overrides: {
            ...s.overrides,
            [part]: { ...existing, ...patch },
          },
        }
      })
    },
    [],
  )

  const updatePartTransform = useCallback(
    (
      part: string,
      field: 'positionOffset' | 'rotation',
      axis: 'x' | 'y' | 'z',
      value: number,
    ) => {
      setState((s) => {
        const existing = s.overrides[part] ?? defaultPartOverride()
        return {
          ...s,
          overrides: {
            ...s.overrides,
            [part]: {
              ...existing,
              [field]: { ...existing[field], [axis]: value },
            },
          },
        }
      })
    },
    [],
  )

  const resetAll = () =>
    setState((s) => ({
      ...s,
      solo: null,
      overrides: buildDefaultOverrides(partNames),
    }))

  const resetPart = (part: string) =>
    setState((s) => ({
      ...s,
      overrides: { ...s.overrides, [part]: defaultPartOverride() },
    }))

  const copyOverridesAsCode = async () => {
    const code = formatOverridesAsCode(state.model, state.overrides, partNames)
    try {
      await navigator.clipboard.writeText(code)
      // eslint-disable-next-line no-alert
      alert('Overrides copied to clipboard.')
    } catch {
      // eslint-disable-next-line no-alert
      alert(`Clipboard blocked. Here it is:\n\n${code}`)
    }
  }

  const copyOverridesAsYaml = async () => {
    const yaml = formatOverridesAsYaml(state, partNames)
    try {
      await navigator.clipboard.writeText(yaml)
      // eslint-disable-next-line no-alert
      alert('YAML copied to clipboard.')
    } catch {
      // eslint-disable-next-line no-alert
      alert(`Clipboard blocked. Here it is:\n\n${yaml}`)
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 1fr 300px',
        gridTemplateRows: '44px 1fr',
        height: '100vh',
        background: '#0a0e14',
        color: '#e0ddd5',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif',
        fontSize: 12,
        overflow: 'hidden',
      }}
    >
      <Toolbar
        state={state}
        setState={setState}
        switchModel={switchModel}
        resetAll={resetAll}
        copy={copyOverridesAsCode}
        copyYaml={copyOverridesAsYaml}
      />
      <Sidebar
        state={state}
        partNames={partNames}
        setState={setState}
        updatePart={updatePart}
        resetPart={resetPart}
      />
      <main style={{ position: 'relative', borderRight: '1px solid #1f2630' }}>
        <EditorScene state={state} partNames={partNames} />
        <CameraHint />
      </main>
      <Inspector
        state={state}
        partNames={partNames}
        updatePart={updatePart}
        updatePartTransform={updatePartTransform}
        resetPart={resetPart}
      />
    </div>
  )
}

// ---------- Toolbar ----------------------------------------------------------

interface ToolbarProps {
  state: EditorState
  setState: React.Dispatch<React.SetStateAction<EditorState>>
  switchModel: (model: RocketModel) => void
  resetAll: () => void
  copy: () => void
  copyYaml: () => void
}

function Toolbar({
  state,
  setState,
  switchModel,
  resetAll,
  copy,
  copyYaml,
}: ToolbarProps) {
  return (
    <div
      style={{
        gridColumn: '1 / span 3',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 16px',
        borderBottom: '1px solid #1f2630',
        background: '#0d121a',
      }}
    >
      <strong style={{ fontSize: 13, letterSpacing: 0.3 }}>Rocket editor</strong>
      <Separator />
      <Group label="rocket">
        <select
          value={state.model}
          onChange={(e) => switchModel(e.target.value as RocketModel)}
          style={{
            background: '#0a0e14',
            color: '#cdd5e0',
            border: '1px solid #2c303a',
            padding: '3px 8px',
            borderRadius: 3,
            fontSize: 12,
          }}
        >
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {ROCKET_MODELS[m].label}
            </option>
          ))}
        </select>
      </Group>
      <Separator />
      <Group label="material">
        {MATERIAL_VARIANTS.map((m) => (
          <Pill
            key={m}
            active={state.globalMaterial === m}
            onClick={() => setState((s) => ({ ...s, globalMaterial: m }))}
          >
            {m}
          </Pill>
        ))}
      </Group>
      <Separator />
      <Group label="helpers">
        <Pill
          active={state.showAxes}
          onClick={() => setState((s) => ({ ...s, showAxes: !s.showAxes }))}
        >
          axes
        </Pill>
        <Pill
          active={state.showGrid}
          onClick={() => setState((s) => ({ ...s, showGrid: !s.showGrid }))}
        >
          grid
        </Pill>
        <Pill
          active={state.showBoxes}
          onClick={() => setState((s) => ({ ...s, showBoxes: !s.showBoxes }))}
        >
          boxes
        </Pill>
        <Pill
          active={state.showWireframe}
          onClick={() =>
            setState((s) => ({ ...s, showWireframe: !s.showWireframe }))
          }
        >
          wireframe
        </Pill>
      </Group>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button type="button" onClick={copyYaml} style={btnStyle('accent')}>
          Copy YAML
        </button>
        <button type="button" onClick={copy} style={btnStyle('ghost')}>
          Copy TS
        </button>
        <button type="button" onClick={resetAll} style={btnStyle('ghost')}>
          Reset all
        </button>
      </div>
    </div>
  )
}

// ---------- Sidebar (layer list) --------------------------------------------

interface SidebarProps {
  state: EditorState
  partNames: readonly string[]
  setState: React.Dispatch<React.SetStateAction<EditorState>>
  updatePart: (part: string, patch: Partial<PartOverride>) => void
  resetPart: (part: string) => void
}

function Sidebar({
  state,
  partNames,
  setState,
  updatePart,
  resetPart,
}: SidebarProps) {
  return (
    <aside
      style={{
        borderRight: '1px solid #1f2630',
        background: '#0c1119',
        overflow: 'auto',
        padding: '12px 0',
      }}
    >
      <h3 style={sectionHeading}>Layers</h3>
      {partNames.map((name) => {
        const ov = state.overrides[name] ?? defaultPartOverride()
        const selected = state.selected === name
        const soloed = state.solo === name
        return (
          <div
            key={name}
            onClick={() => setState((s) => ({ ...s, selected: name }))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              cursor: 'pointer',
              background: selected ? '#1a2332' : 'transparent',
              borderLeft: selected ? '2px solid #d8804a' : '2px solid transparent',
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                updatePart(name, { visible: !ov.visible })
              }}
              title={ov.visible ? 'Hide' : 'Show'}
              style={iconBtnStyle}
            >
              {ov.visible ? '●' : '○'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setState((s) => ({ ...s, solo: soloed ? null : name }))
              }}
              title={soloed ? 'Unsolo' : 'Solo'}
              style={{
                ...iconBtnStyle,
                color: soloed ? '#d8804a' : '#7a8290',
                fontWeight: 700,
              }}
            >
              S
            </button>
            <span
              style={{
                flex: 1,
                textTransform: 'capitalize',
                fontVariant: 'all-small-caps',
                letterSpacing: 0.4,
              }}
            >
              {name}
            </span>
            {hasAdjustments(ov) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  resetPart(name)
                }}
                title="Reset part"
                style={{ ...iconBtnStyle, fontSize: 11 }}
              >
                ↺
              </button>
            )}
          </div>
        )
      })}
      <h3 style={{ ...sectionHeading, marginTop: 24 }}>How it works</h3>
      <p style={{ padding: '0 16px', color: '#8a8e96', lineHeight: 1.45 }}>
        Pick a part to edit it in the inspector.{' '}
        <strong>Copy YAML</strong> emits a snippet for a{' '}
        <code>starship:viewer</code> block in a story config — paste it into
        the admin Monaco editor. <strong>Copy TS</strong> emits the older
        import-script snippet that bakes the fix into the GLB.
      </p>
    </aside>
  )
}

// ---------- Inspector --------------------------------------------------------

interface InspectorProps {
  state: EditorState
  partNames: readonly string[]
  updatePart: (part: string, patch: Partial<PartOverride>) => void
  updatePartTransform: (
    part: string,
    field: 'positionOffset' | 'rotation',
    axis: 'x' | 'y' | 'z',
    value: number,
  ) => void
  resetPart: (part: string) => void
}

function Inspector({
  state,
  updatePart,
  updatePartTransform,
}: InspectorProps) {
  const part = state.selected
  if (!part) {
    return (
      <aside
        style={{
          borderLeft: '1px solid #1f2630',
          background: '#0c1119',
          padding: 16,
          color: '#7a8290',
        }}
      >
        Select a layer to edit.
      </aside>
    )
  }
  const ov = state.overrides[part] ?? defaultPartOverride()
  return (
    <aside
      style={{
        borderLeft: '1px solid #1f2630',
        background: '#0c1119',
        overflow: 'auto',
        padding: '12px 0',
      }}
    >
      <h3 style={sectionHeading}>
        Inspector — <span style={{ color: '#d8804a' }}>{part}</span>
      </h3>
      <FieldGroup label="Position offset">
        <AxisSliders
          axes={['x', 'y', 'z']}
          values={ov.positionOffset}
          min={-3}
          max={3}
          step={0.01}
          onChange={(axis, value) =>
            updatePartTransform(part, 'positionOffset', axis, value)
          }
        />
      </FieldGroup>
      <FieldGroup label="Rotation (rad)">
        <AxisSliders
          axes={['x', 'y', 'z']}
          values={ov.rotation}
          min={-Math.PI}
          max={Math.PI}
          step={0.01}
          onChange={(axis, value) =>
            updatePartTransform(part, 'rotation', axis, value)
          }
        />
      </FieldGroup>
      <FieldGroup label={`Scale × ${ov.scaleMultiplier.toFixed(3)}`}>
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.005}
          value={ov.scaleMultiplier}
          onChange={(e) =>
            updatePart(part, { scaleMultiplier: parseFloat(e.target.value) })
          }
          style={{ width: '100%' }}
        />
      </FieldGroup>
      <FieldGroup label="Material override">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Pill
            active={ov.materialOverride === null}
            onClick={() => updatePart(part, { materialOverride: null })}
          >
            (inherit)
          </Pill>
          {MATERIAL_VARIANTS.map((m) => (
            <Pill
              key={m}
              active={ov.materialOverride === m}
              onClick={() => updatePart(part, { materialOverride: m })}
            >
              {m}
            </Pill>
          ))}
        </div>
        <p
          style={{
            margin: '8px 0 0',
            color: '#7a8290',
            fontSize: 10.5,
            lineHeight: 1.5,
          }}
        >
          {ROCKET_MODELS[state.model].materialOverrides === 'preserve-authored'
            ? 'This model preserves its authored textures — material overrides have no effect.'
            : 'Material swap applied via direct three.js material assignment.'}
        </p>
      </FieldGroup>
    </aside>
  )
}

// ---------- Small UI primitives ---------------------------------------------

const sectionHeading: React.CSSProperties = {
  margin: 0,
  padding: '0 16px 8px',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 1.2,
  color: '#7a8290',
}

const iconBtnStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: '#cdd5e0',
  cursor: 'pointer',
  fontSize: 13,
  padding: 0,
}

function btnStyle(variant: 'accent' | 'ghost'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 12,
    cursor: 'pointer',
    border: '1px solid transparent',
  }
  if (variant === 'accent') {
    return { ...base, background: '#d8804a', color: '#0a0e14' }
  }
  return {
    ...base,
    background: 'transparent',
    border: '1px solid #2c303a',
    color: '#cdd5e0',
  }
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 8px',
        borderRadius: 3,
        border: '1px solid #2c303a',
        background: active ? '#d8804a' : 'transparent',
        color: active ? '#0a0e14' : '#cdd5e0',
        cursor: 'pointer',
        fontSize: 11,
        lineHeight: 1.3,
        textTransform: 'capitalize',
      }}
    >
      {children}
    </button>
  )
}

function Separator() {
  return (
    <div style={{ width: 1, height: 20, background: '#1f2630' }} aria-hidden />
  )
}

function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: '#7a8290' }}>{label}</span>
      {children}
    </div>
  )
}

function FieldGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div style={{ padding: '8px 16px 12px' }}>
      <div
        style={{
          fontSize: 10.5,
          color: '#7a8290',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

function AxisSliders({
  axes,
  values,
  min,
  max,
  step,
  onChange,
}: {
  axes: readonly ('x' | 'y' | 'z')[]
  values: { x: number; y: number; z: number }
  min: number
  max: number
  step: number
  onChange: (axis: 'x' | 'y' | 'z', value: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {axes.map((axis) => (
        <div
          key={axis}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span
            style={{
              width: 14,
              textTransform: 'uppercase',
              color:
                axis === 'x' ? '#e85d6c' : axis === 'y' ? '#7ad36b' : '#5fa9ff',
              fontWeight: 600,
            }}
          >
            {axis}
          </span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={values[axis]}
            onChange={(e) => onChange(axis, parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            value={values[axis].toFixed(3)}
            step={step}
            onChange={(e) => {
              const n = parseFloat(e.target.value)
              if (Number.isFinite(n)) onChange(axis, n)
            }}
            style={{
              width: 64,
              background: '#0a0e14',
              border: '1px solid #2c303a',
              color: '#cdd5e0',
              padding: '2px 4px',
              fontSize: 11,
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              borderRadius: 3,
            }}
          />
        </div>
      ))}
    </div>
  )
}

function CameraHint() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        padding: '4px 8px',
        fontSize: 10,
        color: '#7a8290',
        background: 'rgba(10,14,20,0.6)',
        border: '1px solid #1f2630',
        borderRadius: 3,
        pointerEvents: 'none',
      }}
    >
      Drag to orbit · Right-drag to pan · Scroll to zoom
    </div>
  )
}

// ---------- Pure helpers -----------------------------------------------------

function hasAdjustments(ov: PartOverride): boolean {
  return (
    !ov.visible ||
    ov.positionOffset.x !== 0 ||
    ov.positionOffset.y !== 0 ||
    ov.positionOffset.z !== 0 ||
    ov.rotation.x !== 0 ||
    ov.rotation.y !== 0 ||
    ov.rotation.z !== 0 ||
    ov.scaleMultiplier !== 1 ||
    ov.materialOverride !== null
  )
}

/**
 * Emit the editor's current adjustments as TypeScript so the user can paste
 * them into the right import script. For `starship` we point at
 * `convert-starship-assets.ts`; for any other model, at `import-glb.ts`.
 * Only non-default fields are emitted.
 */
function formatOverridesAsCode(
  model: RocketModel,
  overrides: Overrides,
  partNames: readonly string[],
): string {
  const script =
    model === 'starship'
      ? 'scripts/convert-starship-assets.ts (in loadPartMesh, after the translate)'
      : 'scripts/import-glb.ts (after the wrapper is built, or directly in source DCC)'
  const lines: string[] = [
    `// Paste these per-part adjustments into ${script}`,
    `// Active rocket: '${model}'. Re-run the import script afterwards.`,
    '',
  ]
  for (const name of partNames) {
    const ov = overrides[name]
    if (!ov || !hasAdjustments(ov)) continue
    lines.push(`if (name === ${JSON.stringify(name)}) {`)
    const { x: px, y: py, z: pz } = ov.positionOffset
    if (px || py || pz) {
      lines.push(`  obj.position.set(${px}, ${py}, ${pz})  // additive`)
    }
    const { x: rx, y: ry, z: rz } = ov.rotation
    if (rx || ry || rz) {
      lines.push(`  obj.rotation.set(${rx.toFixed(4)}, ${ry.toFixed(4)}, ${rz.toFixed(4)})`)
    }
    if (ov.scaleMultiplier !== 1) {
      lines.push(`  obj.scale.multiplyScalar(${ov.scaleMultiplier.toFixed(4)})`)
    }
    if (!ov.visible) {
      lines.push(`  // skip this part entirely`)
    }
    lines.push(`}`)
  }
  if (lines.length === 3) lines.push('// (no adjustments yet)')
  return lines.join('\n')
}

/**
 * Emit the editor's current state as a YAML fragment for pasting into a
 * `- type: starship:viewer` block in `<slug>.config.yaml`.
 *
 * Only `model` and `material` round-trip through the live `parseConfig`
 * today. `parts`, `helpers`, `camera`, `lights`, and `ground` are emitted
 * for forward compatibility — `parseConfig` ignores unknown keys, so they
 * sit harmlessly in the YAML until someone wires them through StarshipScene.
 * The header comment in the output flags this for the reader.
 *
 * Per-part fields are emitted only when they differ from defaults to keep
 * the output minimal. Scene defaults mirror the hard-coded values in
 * `verticals/starship-viz/src/web/StarshipScene.tsx`.
 */
function formatOverridesAsYaml(
  state: EditorState,
  partNames: readonly string[],
): string {
  const lines: string[] = [
    '# Copied from /starship-editor — paste into a `- type: starship:viewer`',
    '# block in your story config.yaml.',
    '#',
    '# LIVE (honored by parseConfig today): type, model, mode, material, scrubSteps.',
    '# FORWARD-LOOKING (parseConfig ignores until wired): parts, helpers,',
    '# camera, lights, ground. They round-trip through Monaco safely.',
    '',
    'type: starship:viewer',
    `model: ${state.model}`,
    '# mode: rotate          # author-set per story unit — rotate | explode | bellyflop | inspect',
    `material: ${state.globalMaterial}`,
    '# scrubSteps: 1         # only meaningful for mode: explode | bellyflop',
  ]

  const partBlocks: string[] = []
  for (const name of partNames) {
    const ov = state.overrides[name]
    if (!ov || !hasAdjustments(ov)) continue
    const fields: string[] = []
    if (!ov.visible) fields.push('    visible: false')
    const { x: px, y: py, z: pz } = ov.positionOffset
    if (px || py || pz) {
      fields.push(`    position: { x: ${fmtNum(px)}, y: ${fmtNum(py)}, z: ${fmtNum(pz)} }`)
    }
    const { x: rx, y: ry, z: rz } = ov.rotation
    if (rx || ry || rz) {
      fields.push(`    rotation: { x: ${fmtNum(rx)}, y: ${fmtNum(ry)}, z: ${fmtNum(rz)} }`)
    }
    if (ov.scaleMultiplier !== 1) {
      fields.push(`    scale: ${fmtNum(ov.scaleMultiplier)}`)
    }
    if (ov.materialOverride !== null) {
      fields.push(`    material: ${ov.materialOverride}`)
    }
    if (fields.length === 0) continue
    partBlocks.push(`  ${name}:\n${fields.join('\n')}`)
  }
  if (partBlocks.length > 0) {
    lines.push('', 'parts:', ...partBlocks)
  } else {
    lines.push('', '# parts: (no per-part adjustments yet)')
  }

  // Helpers — debug overlays. Emit only when any deviate from default
  // (axes/grid on; boxes/wireframe off) so production YAML stays clean.
  const helpersDirty =
    !state.showAxes || !state.showGrid || state.showBoxes || state.showWireframe
  if (helpersDirty) {
    lines.push(
      '',
      '# Debug helpers — editor-only by default; safe to omit in production.',
      'helpers:',
      `  axes: ${state.showAxes}`,
      `  grid: ${state.showGrid}`,
      `  boxes: ${state.showBoxes}`,
      `  wireframe: ${state.showWireframe}`,
    )
  }

  // Scene-level defaults — mirror StarshipScene.tsx hard-coded values so the
  // YAML is a complete starting point for tuning in Monaco.
  lines.push(
    '',
    '# Scene-level defaults (from StarshipScene.tsx). Edit in Monaco to tune.',
    'camera:',
    '  position: { x: 3.5, y: 1.4, z: 5 }',
    '  fov: 40',
    'lights:',
    '  ambient: 0.5',
    '  key:  { position: { x: 5,  y: 8, z: 4 },  intensity: 1.3 }',
    '  fill: { position: { x: -4, y: 2, z: -3 }, intensity: 0.5 }',
    'ground:',
    '  show: true',
    "  color: '#0a0d12'",
    '  opacity: 0.55',
    '  y: -1.55',
  )

  return lines.join('\n')
}

/** Trim trailing zeros from a fixed-precision number so the YAML stays tidy. */
function fmtNum(n: number): string {
  if (n === 0) return '0'
  const s = n.toFixed(4)
  return s.replace(/\.?0+$/, '') || '0'
}
