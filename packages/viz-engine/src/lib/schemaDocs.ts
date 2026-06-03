/**
 * Render a layer module's Zod schema as exact-shape prompt text.
 *
 * The schema-first migration made `module.schema` (with rich `.describe()`
 * field docs) the single source of truth. This walks that schema to produce the
 * "Accepted fields … + example" prompt the AI generation + Q&A surfaces feed to
 * the model — so the docs can never drift from the validator. Supersedes the
 * old `adminForm`-derived `buildLayerSchemaPrompt` / per-module `aiFieldExamples`
 * / `aiSchema`.
 */

import { getVizModule } from '../registry'

const RAW_YAML_RULE =
  'Output ONLY valid YAML for this one layer mapping — no markdown code fences, ' +
  'no commentary, no surrounding keys.'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Unwrapped {
  inner: any
  optional: boolean
  def: unknown
  description?: string
}

/** Peel ZodOptional/Default/Nullable/Effects, collecting optionality + docs. */
function unwrap(schema: any): Unwrapped {
  let cur = schema
  let optional = false
  let def: unknown
  let description: string | undefined
  while (cur && cur._def) {
    if (cur._def.description && !description) description = cur._def.description
    const t = cur._def.typeName
    if (t === 'ZodOptional' || t === 'ZodNullable') {
      optional = true
      cur = cur._def.innerType
      continue
    }
    if (t === 'ZodDefault') {
      try {
        def = cur._def.defaultValue()
      } catch {
        def = undefined
      }
      cur = cur._def.innerType
      continue
    }
    if (t === 'ZodCatch') {
      try {
        def = cur._def.catchValue()
      } catch {
        def = undefined
      }
      cur = cur._def.innerType
      continue
    }
    if (t === 'ZodEffects') {
      cur = cur._def.schema
      continue
    }
    break
  }
  return { inner: cur, optional, def, description }
}

/**
 * A short type hint for a (already-unwrapped) Zod type. Recurses ONE level into
 * nested objects / arrays-of-objects so sub-fields surface (e.g. rive's
 * `viewModel: { instance?, bindings? }`); deeper nesting collapses to `object`.
 */
function typeHint(s: any, depth = 0): string {
  const t = s?._def?.typeName
  switch (t) {
    case 'ZodString':
      return 'string'
    case 'ZodNumber':
      return 'number'
    case 'ZodBoolean':
      return 'true | false'
    case 'ZodLiteral':
      return JSON.stringify(s._def.value)
    case 'ZodEnum':
      return (s._def.values as string[]).map((v) => `'${v}'`).join(' | ')
    case 'ZodArray': {
      const elem = typeHint(unwrap(s._def.type).inner, depth)
      return elem.includes(' | ') ? `(${elem})[]` : `${elem}[]`
    }
    case 'ZodUnion':
      return (s._def.options as any[]).map((o) => typeHint(unwrap(o).inner, depth)).join(' | ')
    case 'ZodObject': {
      if (depth >= 1) return 'object'
      const fields = Object.entries(s.shape as Record<string, any>).map(([k, f]) => {
        const u = unwrap(f)
        return `${k}${u.optional || u.def !== undefined ? '?' : ''}: ${typeHint(u.inner, depth + 1)}`
      })
      return `{ ${fields.join(', ')} }`
    }
    case 'ZodRecord':
      return 'map'
    default:
      return 'value'
  }
}

/**
 * Build the exact-shape prompt for a layer type from its Zod schema, or null
 * when the type is unknown / has no schema.
 */
export function describeLayerSchema(type: string): string | null {
  const mod = getVizModule(type)
  const schema = mod?.schema as any
  if (!schema?._def || schema._def.typeName !== 'ZodObject') return null

  const shape = schema.shape as Record<string, any>
  const lines: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    if (key === 'type') continue // the discriminant — emitted explicitly below
    const { inner, optional, def, description } = unwrap(field)
    // A field with a default is effectively optional — the author can omit it.
    const req = optional || def !== undefined ? '' : ' (required)'
    const defStr = def !== undefined ? ` (default ${JSON.stringify(def)})` : ''
    const desc = description ? ` — ${description}` : ''
    lines.push(`  - ${key}: ${typeHint(inner)}${req}${defStr}${desc}`)
  }

  return (
    `You author one \`${mod!.type}\` layer (“${mod!.label}”) for a data-driven ` +
    `story, as YAML. The layer is a mapping discriminated by \`type: ${mod!.type}\`.\n\n` +
    `Accepted fields (a field marked (required) must be present; omit optional ` +
    `fields you don't need):\n${lines.join('\n')}\n\n` +
    RAW_YAML_RULE
  )
}
