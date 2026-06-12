import type { DomainPack } from './types'

/**
 * The default desk — today's behavior, exactly. The persona is the verbatim
 * opening sentence of the pre-seam RESEARCH/ANGLES systems, no per-stage
 * guidance, no vertical layers, so every prompt builder's default-pack output
 * is byte-identical to the committed snapshot (packs.test.ts proves it).
 */
export const VIZMAYA_PACK: DomainPack = {
  id: 'vizmaya',
  name: 'Vizmaya',
  persona: 'You are a research analyst preparing a data-driven visual story for the Vizmaya desk. ',
  bylineExample: 'By the Vizmaya desk',
  extraLayerTypes: [],
}
