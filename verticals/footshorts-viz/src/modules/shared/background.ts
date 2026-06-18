import type { AdminFormField } from '@vismay/viz-engine'

/**
 * Opt-in image background shared by every `fs:*` module. Mixed into each module's
 * config so authors get one consistent set of fields (URL + fit + dim + blur)
 * regardless of which footshorts module they're using. All fields optional — when
 * `backgroundImage` is absent the module renders exactly as before.
 *
 * Rendering lives in `web/FsFrame.tsx`; parsing + admin-form rows live here so a
 * module wires the whole feature in with `...parseFsBackground(raw)` and
 * `...fsBackgroundFields()`.
 */
export interface FsBackgroundConfig {
  /** URL of a background image painted behind the module content. */
  backgroundImage?: string
  /** How the image fills the frame. Defaults to `cover`. */
  backgroundFit?: 'cover' | 'contain'
  /** Dark scrim opacity over the image, 0–1 — keeps foreground text/crests legible. Defaults to 0. */
  backgroundDim?: number
  /** Gaussian blur applied to the image, in px. Defaults to 0. */
  backgroundBlur?: number
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/**
 * Pulls the shared background fields off a raw layer config. Lenient by design —
 * invalid/unknown values are dropped rather than thrown, so a stray
 * `backgroundDim` never breaks an otherwise-valid card. Spread the result into a
 * module's parsed config: `{ ...parseFsBackground(raw) }`.
 */
export function parseFsBackground(raw: unknown): FsBackgroundConfig {
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: FsBackgroundConfig = {}
  if (typeof r.backgroundImage === 'string' && r.backgroundImage.length > 0) {
    out.backgroundImage = r.backgroundImage
  }
  if (r.backgroundFit === 'cover' || r.backgroundFit === 'contain') {
    out.backgroundFit = r.backgroundFit
  }
  if (typeof r.backgroundDim === 'number' && Number.isFinite(r.backgroundDim)) {
    out.backgroundDim = clamp01(r.backgroundDim)
  }
  if (
    typeof r.backgroundBlur === 'number' &&
    Number.isFinite(r.backgroundBlur) &&
    r.backgroundBlur >= 0
  ) {
    out.backgroundBlur = r.backgroundBlur
  }
  return out
}

/** The four background props, picked off any module config for `<FsFrame {...} />`. */
export function pickFsBackground(config: FsBackgroundConfig): FsBackgroundConfig {
  return {
    backgroundImage: config.backgroundImage,
    backgroundFit: config.backgroundFit,
    backgroundDim: config.backgroundDim,
    backgroundBlur: config.backgroundBlur,
  }
}

/** Admin-form rows for the shared background fields. Append to a module's `adminForm()`. */
export function fsBackgroundFields(): AdminFormField[] {
  return [
    { kind: 'text', key: 'backgroundImage', label: 'Background image URL' },
    {
      kind: 'select',
      key: 'backgroundFit',
      label: 'Background fit',
      options: [
        { value: 'cover', label: 'cover' },
        { value: 'contain', label: 'contain' },
      ],
    },
    { kind: 'number', key: 'backgroundDim', label: 'Background dim (0–1)', min: 0, max: 1, step: 0.05 },
    { kind: 'number', key: 'backgroundBlur', label: 'Background blur (px)', min: 0, step: 1 },
  ]
}
