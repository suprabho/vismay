/**
 * Schema-aware system prompts for AI layer generation.
 *
 * The canvas PromptBar generates a layer's YAML from a natural-language prompt.
 * A generic "author one layer's fields as YAML" instruction makes the model
 * guess field names, so the output often fails `parseConfig`. This builder
 * instead derives the *exact* accepted shape from the module's own
 * `adminForm()` descriptor — the same source of truth that drives the inspector
 * form and mirrors `parseConfig` — so the prompt can never drift from the
 * renderer/validator.
 *
 * Returns `null` when the module is unknown or exposes no `adminForm` (e.g.
 * `chart`, `map`), so the caller falls back to the slot's generic default.
 * Modules with `json` fields (nested shapes `adminForm` can't fully describe)
 * still produce a useful field list; their nested examples are a later step.
 */

import { getVizModule } from '../registry'
import type { AdminFormField } from '../types'

/** Theme palette tokens accepted by `theme-token` fields (mirrors `StatColor`). */
const THEME_TOKENS = ['accent', 'accent2', 'red', 'positive', 'amber', 'teal', 'muted']

const RAW_YAML_RULE =
  'Output ONLY valid YAML for this one layer mapping — no markdown code fences, ' +
  'no commentary, no surrounding keys.'

/**
 * Build the exact-shape system prompt for a single layer type, derived from its
 * module's `adminForm()`. Returns null when no schema can be derived.
 */
export function buildLayerSchemaPrompt(layerType: string): string | null {
  const mod = getVizModule(layerType)
  if (!mod) return null

  // Prefer deriving from adminForm (the live source of truth). Modules without
  // one (chart, map) supply a hand-written `aiSchema` body instead.
  let body: string | null = null
  if (typeof mod.adminForm === 'function') {
    body = deriveBody(mod, layerType)
  } else if (mod.aiSchema) {
    body = mod.aiSchema.trim()
  }
  if (!body) return null

  return (
    `You author one \`${mod.type}\` layer (“${mod.label}”) for a data-driven ` +
    `story, as YAML. The layer is a mapping discriminated by \`type: ${mod.type}\`.\n\n` +
    `${body}\n\n` +
    RAW_YAML_RULE
  )
}

/** The field-list + worked-example body derived from a module's adminForm. */
function deriveBody(
  mod: { adminForm?: (c: null) => AdminFormField[]; aiFieldExamples?: Record<string, string> },
  layerType: string,
): string | null {
  let fields: AdminFormField[]
  try {
    fields = mod.adminForm!(null)
  } catch {
    return null
  }
  if (!fields.length) return null

  const examples = mod.aiFieldExamples ?? {}
  const fieldLines = fields.map((f) => `  - ${describeField(f)}`).join('\n')
  const example = buildExample(layerType, fields, examples)

  return (
    `Accepted fields (a field marked (required) must be present; omit optional ` +
    `fields you don't need):\n${fieldLines}\n\n` +
    `Example shape:\n${example}`
  )
}

/** One documentation line for an admin-form field. */
function describeField(f: AdminFormField): string {
  const req = 'required' in f && f.required ? ' (required)' : ''
  switch (f.kind) {
    case 'text':
      return `${f.key}: string${req}${f.placeholder ? ` — e.g. "${f.placeholder}"` : ''}`
    case 'number': {
      const bounds = [
        f.min != null ? `min ${f.min}` : null,
        f.max != null ? `max ${f.max}` : null,
      ]
        .filter(Boolean)
        .join(', ')
      return `${f.key}: number${bounds ? ` (${bounds})` : ''}${req}`
    }
    case 'boolean':
      return `${f.key}: true | false${req}`
    case 'select':
      return `${f.key}: ${f.options.map((o) => `'${o.value}'`).join(' | ')}${req}`
    case 'theme-token':
      return `${f.key}: <theme token: ${THEME_TOKENS.join(' | ')}>${req}`
    case 'asset':
      return `${f.key}: string — an "assets://…" ref or https:// URL${req}`
    case 'json':
      return `${f.key}: ${f.label} — a nested YAML value${req}`
    default:
      return `${(f as { key: string }).key}: <value>`
  }
}

/** A compact worked YAML example, nesting dotted keys (e.g. `textStyle.size`). */
function buildExample(
  layerType: string,
  fields: AdminFormField[],
  examples: Record<string, string>,
): string {
  // Only illustrate required fields plus a couple of common optionals, so the
  // example stays short. Always lead with the type discriminant.
  const lines: string[] = [`type: ${layerType}`]
  const nested: Record<string, string[]> = {}

  for (const f of fields) {
    const required = 'required' in f && f.required
    if (f.kind === 'json') {
      // Nested shapes come from the module's hand-written example, not a
      // synthesised placeholder. Skip optional json with no example.
      const ex = examples[f.key]
      if (ex) lines.push(...ex.split('\n'))
      else if (required) lines.push(`${f.key}: []`)
      continue
    }
    const value = exampleValue(f)
    if (value == null) continue

    const dot = f.key.indexOf('.')
    if (dot > 0) {
      const parent = f.key.slice(0, dot)
      const child = f.key.slice(dot + 1)
      ;(nested[parent] ??= []).push(`  ${child}: ${value}`)
    } else {
      lines.push(`${f.key}: ${value}`)
    }
  }

  for (const [parent, children] of Object.entries(nested)) {
    lines.push(`${parent}:`)
    lines.push(...children)
  }

  return lines.join('\n')
}

/** A placeholder example value for a field, or null to omit it. */
function exampleValue(f: AdminFormField): string | null {
  switch (f.kind) {
    case 'text':
      return f.placeholder ? `"${f.placeholder}"` : '"…"'
    case 'number':
      return String(f.min ?? 0)
    case 'boolean':
      return 'false'
    case 'select':
      return f.options[0] ? `${f.options[0].value}` : null
    case 'theme-token':
      return 'accent2'
    case 'asset':
      return '"assets://your-asset"'
    // 'json' fields are handled by buildExample via aiFieldExamples, not here.
    default:
      return null
  }
}
