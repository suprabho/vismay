/**
 * Dump every system-prompt surface to `vizmayaPrompts.snapshot.json`.
 *
 * Captured BEFORE the DomainPack refactor and asserted byte-identical after
 * (packs.test.ts) — the proof that parameterizing the prompts on a pack does
 * not change what the vizmaya desk sends to the model.
 *
 * Run: npx tsx src/__fixtures__/dumpPrompts.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RESEARCH_SYSTEM,
  ANGLES_SYSTEM,
  CHART_SYSTEM,
  REGIONS_SYSTEM,
  SUBSECTION_CONTENT_SYSTEM,
  SUBSECTION_VISUAL_SYSTEM,
  outlineSystem,
  contentSystem,
  visualSystem,
} from '../prompts'

const snapshot = {
  RESEARCH_SYSTEM,
  ANGLES_SYSTEM,
  CHART_SYSTEM,
  REGIONS_SYSTEM,
  SUBSECTION_CONTENT_SYSTEM,
  SUBSECTION_VISUAL_SYSTEM,
  'outlineSystem.deck': outlineSystem('deck'),
  'outlineSystem.map': outlineSystem('map'),
  'contentSystem.deck': contentSystem('deck'),
  'contentSystem.map': contentSystem('map'),
  'visualSystem.deck': visualSystem('deck'),
  'visualSystem.map': visualSystem('map'),
}

const out = join(__dirname, 'vizmayaPrompts.snapshot.json')
writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n')
console.log(`✓ wrote ${Object.keys(snapshot).length} prompt surfaces to ${out}`)
