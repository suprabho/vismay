/**
 * Structured-output specs for the per-slot canvas generator.
 *
 * The `generate` route used to ask the model for a YAML *string* per slot, then
 * a chain of fixers tried to repair the malformed output. This registry removes
 * that failure mode: for the slots modelled here, the model fills typed JSON
 * (constrained at the provider level via `generateObject`), and the route
 * `yaml.stringify`s the reshaped result — so the value is valid by construction.
 *
 * Each spec returns:
 *   - `schema`  — the Zod schema the model's output is constrained to;
 *   - `toValue` — reshapes the validated object into the exact YAML-fragment the
 *                 client's `mergeSlice` expects for that slot (it does
 *                 `parseYaml(value)` and splices the result verbatim — see
 *                 canvasEditing.ts), so the shape must match what that splice
 *                 writes (a layer mapping, a list, a `{ map: … }` wrapper, …);
 *   - `system`  — structured-generation guidance (the model fills fields, so the
 *                 "output only YAML" phrasing of the legacy prompts is dropped).
 *
 * Slots NOT modelled here (defaults, share, slides, report, shareMap) fall back
 * to the route's legacy string generation + parse-warning, unchanged — so this
 * registry can grow slot-by-slot without regressing the rest.
 */

import { z } from 'zod'
import {
  getVizModule,
  genForegroundSchema,
  normalizeForeground,
  genBackgroundSchema,
  genForegroundLayerSchema,
  genMapCameraSchema,
} from '@vismay/viz-engine'
import type { AiSlotKind } from './aiSlots'

export interface SlotGenSpec {
  /** Schema the model's structured output is constrained to. */
  schema: z.ZodTypeAny
  /** Reshape the validated object into the YAML-fragment value `mergeSlice` expects. */
  toValue: (parsed: unknown) => unknown
  /** System guidance for the structured generation. */
  system: string
}

/* ─── Theme (bare `colors` + `fonts` mapping, no `theme:` wrapper) ─── */

const themeSchema = z.object({
  colors: z
    .object({
      background: z.string().describe('Page background CSS color.'),
      text: z.string().describe('Primary text CSS color.'),
      accent: z.string().describe('Primary accent CSS color.'),
      accent2: z.string().describe('Secondary accent CSS color.'),
      teal: z.string().describe('Teal token CSS color.'),
      surface: z.string().describe('Panel/surface CSS color.'),
      muted: z.string().describe('Muted/secondary text CSS color.'),
      positive: z.string().optional(),
      amber: z.string().optional(),
      red: z.string().optional(),
      line: z.string().optional(),
    })
    .describe('Theme colors. background, text, accent, accent2, teal, surface, muted are required.'),
  fonts: z
    .object({
      serif: z.string().describe('Serif font-family stack.'),
      sans: z.string().describe('Sans-serif font-family stack.'),
      mono: z.string().describe('Monospace font-family stack.'),
    })
    .describe('Font-family stacks.'),
})

/* ─── Map override (a `{ map: <camera> }` mapping — target is set client-side) ─── */

const mapSlotSchema = z.object({
  map: genMapCameraSchema.describe('The autoplay camera override for this section.'),
})

/* ─── Region (a flat list of foreground layers) ─── */

const regionSchema = z.object({
  layers: z.array(genForegroundLayerSchema).describe('The layers placed in this region.'),
})

/**
 * The structured-generation spec for a slot, or null when the slot isn't
 * modelled (the route then falls back to legacy string generation). `layerType`
 * only matters for `kind: 'layer'`.
 */
export function slotGenSpec(kind: AiSlotKind, layerType?: string): SlotGenSpec | null {
  switch (kind) {
    case 'foreground':
      return {
        schema: genForegroundSchema,
        toValue: (p) => normalizeForeground(p as never) ?? [],
        system:
          'You author the foreground for one section of a Vizmaya deck story. ' +
          'Use `layout` + `regions` for a composed slide, or a flat `layers` list. ' +
          'Each layer has a `type` and that type’s own fields.',
      }
    case 'background':
      return {
        schema: genBackgroundSchema,
        toValue: (p) => p,
        system:
          'You author the background for one section of a Vizmaya story: a single ' +
          'image or map layer, or { type: none } to suppress the backdrop.',
      }
    case 'region':
      return {
        schema: regionSchema,
        toValue: (p) => (p as { layers: unknown[] }).layers,
        system:
          'You author the layers for one foreground region of a Vizmaya deck story. ' +
          'Each layer has a `type` and that type’s own fields.',
      }
    case 'layer': {
      // Image layers are an image-generation modality, not YAML. Map uses a
      // passthrough schema that isn't structured-output friendly — both fall
      // back to the legacy path.
      if (!layerType || layerType === 'image' || layerType === 'map') return null
      const mod = getVizModule(layerType)
      if (!mod?.schema) return null
      return {
        schema: mod.schema,
        toValue: (p) => p,
        system: `You author one \`${mod.type}\` (“${mod.label}”) layer for a Vizmaya story. Fill its fields.`,
      }
    }
    case 'theme':
      return {
        schema: themeSchema,
        toValue: (p) => p,
        system:
          'You author a Vizmaya theme: a `colors` mapping and a `fonts` mapping. ' +
          'Use coherent CSS colors and font-family stacks.',
      }
    case 'map':
      return {
        schema: mapSlotSchema,
        toValue: (p) => p,
        system:
          'You author an autoplay map camera override for one section of a Vizmaya story. ' +
          'Set the camera fields you need under `map` (center [lng, lat], zoom, pitch, bearing, pins).',
      }
    default:
      return null
  }
}
