'use client'

import type { ReactNode, Ref } from 'react'
import {
  composerUid,
  DEFAULT_TRANSFORM,
  PROJECT_OUTPUT_SIZE,
  type ComposerHost,
  type ComposerLayer,
  type VideoProjectAspect,
} from '@vismay/viz-admin'
import type { VizLayer } from '@vismay/viz-engine'

/** Editor-px down-scale from the project's true output size (1080/1920). The
 *  shell's PreviewPane then fits THIS to the available center column. */
const EDITOR_SCALE = 0.5

/** Per-render context threaded to the host: the current project aspect. */
export interface VideoComposerCtx {
  aspect: VideoProjectAspect
}

/** Natural editor-px card size for the aspect (PreviewPane scales it to fit). */
function cardSizeFor(aspect: VideoProjectAspect): { w: number; h: number } {
  const out = PROJECT_OUTPUT_SIZE[aspect]
  return { w: Math.round(out.w * EDITOR_SCALE), h: Math.round(out.h * EDITOR_SCALE) }
}

/** A fresh engine layer for a newly added clip type. `src` starts empty — the
 *  user fills it via the config panel / asset picker (the registry's adminForm
 *  enforces it before render). */
function defaultLayer(type: string): VizLayer {
  switch (type) {
    case 'image':
      return { type: 'image', src: '', fit: 'contain' }
    case 'text':
      return { type: 'text', content: 'New text' }
    case 'video':
    default:
      return { type: 'video', src: '', muted: true }
  }
}

/** Default on-canvas placement for a newly added clip: media fills the frame,
 *  text/image sit in a centered box. */
function defaultTransform(type: string) {
  if (type === 'video') {
    return { xPct: 50, yPct: 50, widthPct: 100, heightPct: 100, scale: 1, rotation: 0, opacity: 1 }
  }
  if (type === 'image') return { ...DEFAULT_TRANSFORM, widthPct: 50, heightPct: 50 }
  return { ...DEFAULT_TRANSFORM, widthPct: 60, heightPct: 24 }
}

const NAME_BY_TYPE: Record<string, string> = {
  video: 'Video clip',
  image: 'Image',
  text: 'Text',
}

/** Aspect-correct black frame that wraps the composed body and forwards the
 *  capture ref. Plain on purpose — the canvas IS the output frame. */
function VideoPreviewFrame({
  aspect,
  body,
  captureRef,
}: {
  aspect: VideoProjectAspect
  body: ReactNode
  captureRef?: Ref<HTMLDivElement>
}) {
  const { w, h } = PROJECT_OUTPUT_SIZE[aspect]
  return (
    <div ref={captureRef} className="relative overflow-hidden bg-black" style={{ width: w, height: h }}>
      {body}
    </div>
  )
}

/**
 * The freeform-video composer host. `free` arrangement so every clip is
 * absolutely placed by its `TransformLike`; the shell's FreeTransformLayer gives
 * drag / resize / rotate. Only visual module types are offered on the canvas —
 * audio is added to audio tracks via the asset panel, never drawn.
 */
export const videoHost: ComposerHost<VideoComposerCtx> = {
  id: 'vizmaya-video',
  arrangement: 'free',
  allowedModuleTypes: () => ['video', 'image', 'text'],
  makeLayer: (type): ComposerLayer => ({
    id: composerUid('clip'),
    layer: defaultLayer(type),
    name: NAME_BY_TYPE[type] ?? type,
    visible: true,
    transform: defaultTransform(type),
  }),
  backgroundOptions: () => [],
  cardSize: (ctx) => cardSizeFor(ctx.aspect),
  renderFrame: ({ ctx, body, captureRef }) => (
    <VideoPreviewFrame aspect={ctx.aspect} body={body} captureRef={captureRef} />
  ),
}
