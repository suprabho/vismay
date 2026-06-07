'use client'

import { useMemo, useState } from 'react'
import { parse as parseYaml, parseDocument, stringify as stringifyYaml } from 'yaml'
import {
  allRegisteredTypes,
  getVizModule,
  listForegroundLayouts,
  type AdminFormField,
} from '@vismay/viz-engine'
import { buildYamlModel } from '@vismay/content-source/yamlSections'
import FixPanel from '@/components/canvas/FixPanel'

/**
 * Read-only Deck composer (Phase 7 MVP).
 *
 * Renders a structured view over a deck-format config.yaml so authors can see
 * the full slide list, layouts, and per-vizslot adminForm fields without
 * scrolling through 400 lines of YAML in Monaco. Each section card shows its
 * id/kind/layout + slot type list; expanding a section shows each slot's
 * adminForm fields with current values populated.
 *
 * Validation surfaces three classes of issue:
 *   1. Layout name not in the registered foregroundLayouts.
 *   2. Vizslot type not in the registry (or not slottable to 'foreground').
 *   3. Required adminForm fields missing on a slot.
 *
 * The "Jump to YAML" button on each section switches the parent EditorClient
 * to the Config tab — actual line-targeted scroll is a follow-up (Monaco's
 * editor API can do it but requires lifting a ref into EditorClient).
 *
 * Where a section has schema mismatches, a ✨ "Fix with AI" button (shown only
 * when `onApplyFix` is wired) opens an inline {@link FixPanel}: it sends the
 * section's whole `foreground` + the detected problems to the `canvas/fix`
 * route, previews the corrected YAML, and on Apply splices it back into
 * config.yaml via a comment-preserving `yaml.Document` round-trip
 * ({@link spliceForeground}). Full per-field inline editing is still a
 * follow-up; the adminForm metadata is in place to power it when that lands.
 */

interface Slot {
  type: string
  config: Record<string, unknown>
}

interface Section {
  index: number
  id: string | null
  kind: string | null
  layout: string | null
  text: string | null
  slots: Slot[]
}

interface DefaultsSummary {
  storyBackground: { type: string; slug?: string } | null
  overlay: { color?: string; opacity?: number; gradient?: string } | null
  panel: Record<string, unknown> | null
  scroll: { mode?: string; paddingY?: string } | null
}

export default function DeckComposerPanel({
  value,
  slug,
  onJumpToYaml,
  onApplyFix,
}: {
  /** Current config.yaml text. */
  value: string
  /** Story slug — needed by the ✨ Fix-with-AI route. */
  slug?: string
  /** Callback to switch the EditorClient to the Config tab. */
  onJumpToYaml?: () => void
  /** Write a corrected config.yaml back to the host (the "Apply fix" action).
   *  When absent, the Fix-with-AI affordance is hidden (read-only mode). */
  onApplyFix?: (nextConfigYaml: string) => void
}) {
  const { sections, defaults, parseError } = useMemo(() => parse(value), [value])
  const knownLayouts = useMemo(
    () => new Set(listForegroundLayouts().map((l) => l.name)),
    []
  )
  const knownForegroundTypes = useMemo(
    () =>
      new Set(
        allRegisteredTypes().filter((t) => getVizModule(t)?.slots.includes('foreground'))
      ),
    []
  )

  if (parseError) {
    return (
      <div className="p-4 m-4 rounded border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
        <div className="font-semibold mb-1">YAML parse error</div>
        <div className="font-mono whitespace-pre-wrap">{parseError}</div>
        <div className="mt-2 opacity-75">
          Fix the syntax in the Config tab — the composer renders the parsed model and
          can&apos;t show structure until the YAML parses.
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4 space-y-4 text-sm">
      <DefaultsCard defaults={defaults} onJumpToYaml={onJumpToYaml} />
      <SectionsList
        sections={sections}
        configText={value}
        slug={slug}
        knownLayouts={knownLayouts}
        knownForegroundTypes={knownForegroundTypes}
        onJumpToYaml={onJumpToYaml}
        onApplyFix={onApplyFix}
      />
    </div>
  )
}

/* ─── Defaults summary ─────────────────────────────────────────── */

function DefaultsCard({
  defaults,
  onJumpToYaml,
}: {
  defaults: DefaultsSummary
  onJumpToYaml?: () => void
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/2 p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="font-mono uppercase tracking-wider text-xs text-white/60">
          Story defaults
        </h3>
        {onJumpToYaml && (
          <button
            type="button"
            onClick={onJumpToYaml}
            className="text-xs underline opacity-60 hover:opacity-100"
          >
            Edit in YAML →
          </button>
        )}
      </header>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2">
        <Row
          label="Backdrop"
          value={
            defaults.storyBackground
              ? `${defaults.storyBackground.type}${defaults.storyBackground.slug ? ` · ${defaults.storyBackground.slug}` : ''}`
              : 'none (will fall back to frontmatter.aura)'
          }
        />
        <Row
          label="Overlay"
          value={
            defaults.overlay
              ? [
                  defaults.overlay.color,
                  defaults.overlay.opacity != null && `opacity ${defaults.overlay.opacity}`,
                  defaults.overlay.gradient && `gradient ${defaults.overlay.gradient}`,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : '—'
          }
        />
        <Row
          label="Panel default"
          value={defaults.panel ? Object.keys(defaults.panel).join(' · ') : '—'}
        />
        <Row
          label="Scroll"
          value={
            defaults.scroll
              ? `${defaults.scroll.mode ?? 'snap'}${defaults.scroll.paddingY ? ` · padY ${defaults.scroll.paddingY}` : ''}`
              : 'snap (default)'
          }
        />
      </dl>
    </section>
  )
}

/* ─── Section list ─────────────────────────────────────────────── */

function SectionsList({
  sections,
  configText,
  slug,
  knownLayouts,
  knownForegroundTypes,
  onJumpToYaml,
  onApplyFix,
}: {
  sections: Section[]
  configText: string
  slug?: string
  knownLayouts: Set<string>
  knownForegroundTypes: Set<string>
  onJumpToYaml?: () => void
  onApplyFix?: (nextConfigYaml: string) => void
}) {
  if (sections.length === 0) {
    return (
      <div className="p-4 text-white/50 italic">No sections in this config.</div>
    )
  }
  return (
    <section>
      <header className="font-mono uppercase tracking-wider text-xs text-white/60 mb-2 px-1">
        Slides ({sections.length})
      </header>
      <div className="space-y-3">
        {sections.map((s) => (
          <SectionCard
            key={s.index}
            section={s}
            configText={configText}
            slug={slug}
            knownLayouts={knownLayouts}
            knownForegroundTypes={knownForegroundTypes}
            onJumpToYaml={onJumpToYaml}
            onApplyFix={onApplyFix}
          />
        ))}
      </div>
    </section>
  )
}

function SectionCard({
  section,
  configText,
  slug,
  knownLayouts,
  knownForegroundTypes,
  onJumpToYaml,
  onApplyFix,
}: {
  section: Section
  configText: string
  slug?: string
  knownLayouts: Set<string>
  knownForegroundTypes: Set<string>
  onJumpToYaml?: () => void
  onApplyFix?: (nextConfigYaml: string) => void
}) {
  const layoutKnown = section.layout == null || knownLayouts.has(section.layout)
  const [fixing, setFixing] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  // Aggregate every schema mismatch on this section into author-readable lines —
  // the same checks SectionCard/SlotCard/FieldRow render as ⚠ / red labels. This
  // is both what we show in the Fix panel and what we feed the repair route.
  const problems = useMemo(
    () => sectionProblems(section, layoutKnown, knownForegroundTypes),
    [section, layoutKnown, knownForegroundTypes]
  )
  const fixable = onApplyFix != null && slug != null && problems.length > 0

  // The YAML fragment the fix operates on — the section's whole `foreground`,
  // since layout / region keys / slot types / required fields are interdependent.
  const foregroundYaml = useMemo(
    () => readForegroundYaml(configText, section.index),
    [configText, section.index]
  )

  function applyFix(fixedYaml: string) {
    try {
      const next = spliceForeground(configText, section.index, fixedYaml)
      onApplyFix?.(next)
      setApplyError(null)
      setFixing(false)
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Could not apply fix to YAML.')
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/2 overflow-hidden">
      <details className="[&[open]>summary]:border-b [&[open]>summary]:border-white/10">
        <summary className="px-4 py-3 cursor-pointer select-none flex items-center gap-3 list-none">
          <span className="font-mono text-xs text-white/40 w-6 tabular-nums">
            {String(section.index + 1).padStart(2, '0')}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">
              {section.text ?? section.id ?? <span className="opacity-50">(no anchor)</span>}
            </div>
            <div className="text-xs text-white/50 mt-0.5 truncate">
              {[
                section.id && `#${section.id}`,
                section.kind && `kind=${section.kind}`,
                section.layout && (
                  <span key="layout" className={layoutKnown ? '' : 'text-amber-300'}>
                    layout={section.layout}
                    {!layoutKnown && ' ⚠'}
                  </span>
                ),
                `${section.slots.length} slot${section.slots.length === 1 ? '' : 's'}`,
              ]
                .filter(Boolean)
                .map((part, i, arr) => (
                  <span key={i}>
                    {part}
                    {i < arr.length - 1 && ' · '}
                  </span>
                ))}
            </div>
          </div>
          {fixable && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setFixing((f) => !f)
              }}
              className="text-xs px-1.5 py-0.5 rounded bg-fuchsia-500/15 text-fuchsia-200 hover:bg-fuchsia-500/25 whitespace-nowrap"
              title={`${problems.length} schema mismatch${problems.length === 1 ? '' : 'es'} — fix with AI`}
            >
              ✨ {fixing ? 'Cancel' : 'Fix with AI'}
            </button>
          )}
          {onJumpToYaml && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onJumpToYaml()
              }}
              className="text-xs underline opacity-60 hover:opacity-100"
            >
              YAML →
            </button>
          )}
        </summary>
        <div className="px-4 py-3 space-y-3">
          {section.slots.length === 0 ? (
            <div className="text-white/50 italic text-xs">No foreground slots.</div>
          ) : (
            section.slots.map((slot, i) => (
              <SlotCard
                key={i}
                slot={slot}
                isKnown={knownForegroundTypes.has(slot.type)}
              />
            ))
          )}
        </div>
      </details>
      {fixing && fixable && slug && (
        <div className="border-t border-white/10 px-4 py-3">
          <FixPanel
            slug={slug}
            kind="foreground"
            currentValue={foregroundYaml}
            problems={problems}
            onApply={applyFix}
            onClose={() => setFixing(false)}
          />
          {applyError && (
            <div className="text-xs text-red-300 mt-2">{applyError}</div>
          )}
        </div>
      )}
    </div>
  )
}

/** Every schema mismatch on a section, as author-readable lines for the fixer. */
function sectionProblems(
  section: Section,
  layoutKnown: boolean,
  knownForegroundTypes: Set<string>
): string[] {
  const out: string[] = []
  if (!layoutKnown) {
    out.push(
      `Unknown layout "${section.layout}" — replace it with a registered layout (or restructure into layout + regions).`
    )
  }
  for (const slot of section.slots) {
    if (!knownForegroundTypes.has(slot.type)) {
      out.push(
        `Unregistered layer type "${slot.type}" — replace it with a valid foreground layer type.`
      )
      continue
    }
    const mod = getVizModule(slot.type)
    const fields: AdminFormField[] = mod?.adminForm
      ? mod.adminForm(slot.config as never)
      : []
    for (const field of fields) {
      const required = 'required' in field && field.required
      const v = slot.config[field.key]
      if (required && (v == null || v === '')) {
        out.push(`Missing required field "${field.label}" on layer "${slot.type}".`)
      }
    }
  }
  return out
}

/* ─── Slot inspector ────────────────────────────────────────────── */

function SlotCard({ slot, isKnown }: { slot: Slot; isKnown: boolean }) {
  const mod = getVizModule(slot.type)
  const fields: AdminFormField[] = isKnown && mod?.adminForm ? mod.adminForm(slot.config as never) : []

  return (
    <div className="rounded border border-white/10 bg-black/30 p-3">
      <header className="flex items-center gap-2 mb-2">
        <span
          className={
            'font-mono text-xs px-1.5 py-0.5 rounded ' +
            (isKnown
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-amber-500/15 text-amber-300')
          }
        >
          {slot.type}
          {!isKnown && ' ⚠'}
        </span>
        {mod?.label && <span className="text-xs text-white/50">{mod.label}</span>}
        {!isKnown && (
          <span className="text-xs text-amber-300/80 ml-auto">
            Module not registered — slot will render nothing
          </span>
        )}
      </header>
      {fields.length > 0 ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-xs">
          {fields.map((field) => (
            <FieldRow key={field.key} field={field} value={slot.config[field.key]} />
          ))}
        </dl>
      ) : (
        <div className="text-xs text-white/40 italic">
          {isKnown
            ? 'Module exposes no adminForm fields (or all are optional and unset).'
            : `Add a viz module with type='${slot.type}' to enable inspection.`}
        </div>
      )}
    </div>
  )
}

function FieldRow({ field, value }: { field: AdminFormField; value: unknown }) {
  const required = 'required' in field && field.required
  const missing = required && (value == null || value === '')
  return (
    <>
      <dt
        className={
          'font-mono uppercase tracking-wider text-[0.65rem] ' +
          (missing ? 'text-red-300' : 'text-white/50')
        }
      >
        {field.label}
        {required && <span className="ml-1 opacity-60">*</span>}
      </dt>
      <dd
        className={
          'font-mono ' + (value == null ? 'text-white/30 italic' : 'text-white/90')
        }
        style={{ wordBreak: 'break-word' }}
      >
        {value == null ? (
          'unset'
        ) : typeof value === 'object' ? (
          <code className="text-[0.7rem]">{JSON.stringify(value)}</code>
        ) : (
          String(value)
        )}
      </dd>
    </>
  )
}

/* ─── Small helpers ─────────────────────────────────────────────── */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-mono uppercase tracking-wider text-[0.65rem] text-white/50">
        {label}
      </dt>
      <dd className="font-mono text-white/85">{value}</dd>
    </>
  )
}

/* ─── Parse ─────────────────────────────────────────────────────── */

function parse(yaml: string): {
  sections: Section[]
  defaults: DefaultsSummary
  parseError: string | null
} {
  let parsed: Record<string, unknown> | null = null
  let parseError: string | null = null
  try {
    parsed = parseYaml(yaml) as Record<string, unknown> | null
  } catch (e) {
    parseError = e instanceof Error ? e.message : 'invalid YAML'
  }

  // buildYamlModel surfaces the per-section line ranges for future "scroll to
  // line" jumps. Not yet wired into Monaco; the model is built here so the
  // hook is in place when we wire it.
  void buildYamlModel(yaml)

  if (!parsed) {
    return { sections: [], defaults: emptyDefaults(), parseError }
  }

  const rawDefaults = (parsed.defaults ?? {}) as Record<string, unknown>
  const sb = rawDefaults.storyBackground as Record<string, unknown> | undefined
  const overlay = rawDefaults.overlay as Record<string, unknown> | undefined
  const panel = rawDefaults.panel as Record<string, unknown> | undefined
  const scroll = rawDefaults.scroll as Record<string, unknown> | undefined

  const defaults: DefaultsSummary = {
    storyBackground: sb
      ? { type: String(sb.type ?? 'unknown'), slug: sb.slug as string | undefined }
      : null,
    overlay: overlay
      ? {
          color: overlay.color as string | undefined,
          opacity: overlay.opacity as number | undefined,
          gradient:
            overlay.gradient && typeof overlay.gradient === 'object'
              ? (overlay.gradient as { type?: string }).type ?? 'gradient'
              : undefined,
        }
      : null,
    panel: panel ?? null,
    scroll: scroll
      ? {
          mode: scroll.mode as string | undefined,
          paddingY: scroll.paddingY as string | undefined,
        }
      : null,
  }

  const rawSections = (parsed.sections ?? []) as Record<string, unknown>[]
  const sections: Section[] = rawSections.map((s, i) => {
    const rawFg = s.foreground
    const fgArray: unknown[] = Array.isArray(rawFg)
      ? rawFg
      : rawFg && typeof rawFg === 'object' && 'regions' in (rawFg as object)
        ? Object.values((rawFg as { regions: Record<string, unknown> }).regions).flatMap(
            (r) => (Array.isArray(r) ? r : [r])
          )
        : rawFg && typeof rawFg === 'object'
          ? [rawFg]
          : []
    const slots: Slot[] = fgArray
      .filter((l): l is Record<string, unknown> => l != null && typeof l === 'object')
      .map((l) => ({
        type: String(l.type ?? 'unknown'),
        config: l,
      }))
    return {
      index: i,
      id: (s.id as string | undefined) ?? null,
      kind: (s.kind as string | undefined) ?? null,
      layout:
        (s.layout as string | undefined) ??
        (rawFg && typeof rawFg === 'object' && !Array.isArray(rawFg) && 'layout' in rawFg
          ? ((rawFg as { layout?: string }).layout ?? null)
          : null),
      text: (s.text as string | undefined) ?? null,
      slots,
    }
  })

  return { sections, defaults, parseError }
}

function emptyDefaults(): DefaultsSummary {
  return { storyBackground: null, overlay: null, panel: null, scroll: null }
}

/* ─── Fix-with-AI helpers ───────────────────────────────────────── */

/**
 * The section's `foreground` as YAML — the "before" fragment the fixer repairs.
 * Falls back to a bare `layout:` mapping for a section that carries only an
 * (invalid) layout and no foreground. Returns '' when nothing can be read.
 */
function readForegroundYaml(configText: string, index: number): string {
  try {
    const parsed = parseYaml(configText) as Record<string, unknown> | null
    const sections = (parsed?.sections ?? []) as Record<string, unknown>[]
    const sec = sections[index]
    if (!sec) return ''
    const fg = sec.foreground
    if (fg == null) {
      return sec.layout ? stringifyYaml({ layout: sec.layout }).trimEnd() : ''
    }
    return stringifyYaml(fg).trimEnd()
  } catch {
    return ''
  }
}

/**
 * Splice the corrected foreground back into config.yaml, preserving comments and
 * untouched sections via a `yaml.Document` round-trip. If the fix carries its
 * own `layout:` key, drop the now-duplicate section-level `layout`.
 */
function spliceForeground(
  configText: string,
  index: number,
  fixedYaml: string
): string {
  const doc = parseDocument(configText)
  const parsedFix = parseYaml(fixedYaml) as unknown
  if (parsedFix == null) throw new Error('The AI returned empty YAML.')
  doc.setIn(['sections', index, 'foreground'], doc.createNode(parsedFix))
  if (
    typeof parsedFix === 'object' &&
    !Array.isArray(parsedFix) &&
    'layout' in (parsedFix as Record<string, unknown>)
  ) {
    doc.deleteIn(['sections', index, 'layout'])
  }
  return String(doc)
}
