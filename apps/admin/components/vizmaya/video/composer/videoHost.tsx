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

/** Per-render context threaded to the host: the current project aspect. */
export interface VideoComposerCtx {
  aspect: VideoProjectAspect
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
  // MUST equal the frame's natural px size (VideoPreviewFrame renders at
  // PROJECT_OUTPUT_SIZE): the shell sizes the FreeTransformLayer overlay by
  // cardSize while fit-scaling the frame to it, so any mismatch skews the
  // selection boxes and drag deltas relative to the drawn pixels. Full output
  // px also keeps the editor WYSIWYG with the render shell (fixed-px/rem type
  // occupies the same share of the frame).
  cardSize: (ctx) => PROJECT_OUTPUT_SIZE[ctx.aspect],
  renderFrame: ({ ctx, body, captureRef }) => (
    <VideoPreviewFrame aspect={ctx.aspect} body={body} captureRef={captureRef} />
  ),
}
