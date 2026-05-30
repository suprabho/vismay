// Native footshorts "storyboards" — hand-authored editorial pages that compose
// footshorts viz widgets in-app (via the viz-engine module renderer), instead of
// iframing a vizmaya.fyi story. Each section pairs prose with one widget layer;
// the layer's `type` + inline config mirror exactly what a story `.config.yaml`
// `foreground` entry would carry, so the same data is drop-in either way.

/** One foreground widget layer: a viz module type plus its inline config. */
export type StoryboardLayerConfig = { type: string } & Record<string, unknown>

export interface StoryboardSection {
  id: string
  heading: string
  /** Prose paragraphs shown above the widget. */
  prose: string[]
  /** The footshorts widget rendered for this section. */
  layer: StoryboardLayerConfig
}

export interface Storyboard {
  slug: string
  title: string
  subtitle: string
  byline: string
  /** Hex accent used for the hero rule + section markers. */
  accent: string
  sections: StoryboardSection[]
}
