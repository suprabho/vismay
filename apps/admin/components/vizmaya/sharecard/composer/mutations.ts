import type {
  BackgroundLayer,
  CardComposition,
  ElementLayer,
  TextBlock,
  Transform,
} from '../layers/types'

/** What the inspector is currently editing. */
export type Selection =
  | { kind: 'background' }
  | { kind: 'element'; id: string }
  | { kind: 'text'; which: 'heading' | 'subheading' }
  | { kind: 'annotation'; id: string }
  | { kind: 'branding' }

let seq = 0
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${seq++}`
}

export function setBackground(c: CardComposition, background: BackgroundLayer): CardComposition {
  return { ...c, background }
}

export function patchBackground(c: CardComposition, patch: Partial<BackgroundLayer>): CardComposition {
  return { ...c, background: { ...c.background, ...patch } as BackgroundLayer }
}

export function addElement(c: CardComposition, element: ElementLayer): CardComposition {
  return { ...c, elements: [...c.elements, element] }
}

export function updateElement(c: CardComposition, id: string, patch: Partial<ElementLayer>): CardComposition {
  return {
    ...c,
    elements: c.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as ElementLayer) : e)),
  }
}

export function patchElementTransform(c: CardComposition, id: string, t: Partial<Transform>): CardComposition {
  return {
    ...c,
    elements: c.elements.map((e) => (e.id === id ? { ...e, transform: { ...e.transform, ...t } } : e)),
  }
}

export function removeElement(c: CardComposition, id: string): CardComposition {
  return { ...c, elements: c.elements.filter((e) => e.id !== id) }
}

/** Move an element up (toward front, +1) or down (-1) in z-order. */
export function moveElement(c: CardComposition, id: string, dir: 1 | -1): CardComposition {
  const i = c.elements.findIndex((e) => e.id === id)
  if (i < 0) return c
  const j = i + dir
  if (j < 0 || j >= c.elements.length) return c
  const next = [...c.elements]
  ;[next[i], next[j]] = [next[j], next[i]]
  return { ...c, elements: next }
}

// ── text blocks ─────────────────────────────────────────────────────────────
export function setHeading(c: CardComposition, heading: TextBlock | undefined): CardComposition {
  return { ...c, text: { ...c.text, heading } }
}
export function setSubheading(c: CardComposition, subheading: TextBlock | undefined): CardComposition {
  return { ...c, text: { ...c.text, subheading } }
}
export function addAnnotation(c: CardComposition, block: TextBlock): CardComposition {
  return { ...c, text: { ...c.text, annotations: [...c.text.annotations, block] } }
}
export function updateAnnotation(c: CardComposition, id: string, patch: Partial<TextBlock>): CardComposition {
  return {
    ...c,
    text: {
      ...c.text,
      annotations: c.text.annotations.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    },
  }
}
export function removeAnnotation(c: CardComposition, id: string): CardComposition {
  return { ...c, text: { ...c.text, annotations: c.text.annotations.filter((a) => a.id !== id) } }
}

/** Patch whichever text block the selection points at. */
export function patchSelectedText(c: CardComposition, sel: Selection, patch: Partial<TextBlock>): CardComposition {
  if (sel.kind === 'text') {
    const cur = sel.which === 'heading' ? c.text.heading : c.text.subheading
    if (!cur) return c
    const next = { ...cur, ...patch }
    return sel.which === 'heading' ? setHeading(c, next) : setSubheading(c, next)
  }
  if (sel.kind === 'annotation') return updateAnnotation(c, sel.id, patch)
  return c
}

export function getSelectedText(c: CardComposition, sel: Selection): TextBlock | undefined {
  if (sel.kind === 'text') return sel.which === 'heading' ? c.text.heading : c.text.subheading
  if (sel.kind === 'annotation') return c.text.annotations.find((a) => a.id === sel.id)
  return undefined
}
