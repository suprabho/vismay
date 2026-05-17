'use client'

import { useEffect, useImperativeHandle, useRef } from 'react'
import type { CSSProperties } from 'react'
import { resolveAssetUrl } from '@/lib/assetUrl'
import type { VizCaptureHandle, VizRenderProps } from '../../types'
import type { VideoLayerConfig } from './index'

/**
 * Native <video> renderer. Honors per-step seeking via `config.stepSync`, and
 * implements `freeze()` so capture surfaces (PDF, share, video render) get a
 * deterministic frame instead of whichever fragment was playing.
 *
 * Capture-frame gotcha: paused <video> elements occasionally rasterize as
 * black in headless chromium until the next frame has been decoded.
 * `freeze()` therefore pauses + seeks + awaits `requestVideoFrameCallback`
 * (with a setTimeout fallback for browsers/Safari versions that don't have
 * it). PDF + share pipelines should `await captureRef.current.freeze()`
 * before snapshotting.
 */
export default function VideoLayerComponent({
  config,
  activeStep,
  mode,
  noteReady,
  captureRef,
}: VizRenderProps<VideoLayerConfig>) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const src = resolveAssetUrl(config.src)
  const posterUrl = config.poster ? resolveAssetUrl(config.poster) : undefined

  // Capture / print mode never auto-plays — the headless pipelines pause
  // immediately on freeze() and we want a paused video to start with, not a
  // first-frame flash. Live scroll + autoplay modes honor `config.autoplay`.
  const liveMode = mode === 'scroll' || mode === 'autoplay'
  const wantsAutoplay = liveMode && (config.autoplay ?? true)

  // Drive currentTime from `activeStep` when stepSync is set. Independent
  // of the play/pause cycle so scroll-driven seeks land on the right frame
  // even when the video is paused mid-playback.
  useEffect(() => {
    const v = videoRef.current
    if (!v || !config.stepSync) return
    const idx = Math.max(0, Math.min(config.stepSync.stepTimestamps.length - 1, activeStep))
    const t = config.stepSync.stepTimestamps[idx]
    if (typeof t === 'number' && Math.abs(v.currentTime - t) > 0.05) {
      v.currentTime = t
    }
  }, [activeStep, config.stepSync])

  useImperativeHandle<VizCaptureHandle | null, VizCaptureHandle>(
    captureRef ?? { current: null },
    () => ({
      freeze: async () => {
        const v = videoRef.current
        if (!v) return
        try {
          v.pause()
          if (config.posterTime != null) {
            v.currentTime = config.posterTime
          }
          await awaitVideoFrame(v)
        } catch {
          /* noop — best-effort */
        }
      },
      resume: () => {
        const v = videoRef.current
        if (!v) return
        if (wantsAutoplay) void v.play().catch(() => {})
      },
    }),
    [config.posterTime, wantsAutoplay]
  )

  const wrapperStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    background: config.background,
    display: 'block',
  }
  const videoStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: config.fit ?? 'cover',
    objectPosition: config.focus ?? 'center',
    display: 'block',
  }

  return (
    <div style={wrapperStyle}>
      <video
        ref={videoRef}
        src={src}
        poster={posterUrl}
        loop={config.loop ?? true}
        muted={config.muted ?? true}
        autoPlay={wantsAutoplay}
        playsInline
        // `preload="auto"` so the first frame is decoded before scroll lands
        // on this section — keeps the readiness signal honest.
        preload="auto"
        style={videoStyle}
        onLoadedData={() => noteReady()}
      />
    </div>
  )
}

/**
 * Resolve once the next video frame has been composited. Modern chromium /
 * webkit ship `requestVideoFrameCallback`; older browsers fall back to a
 * 50ms timer which is long enough for a paused-and-seeked frame to surface.
 */
function awaitVideoFrame(v: HTMLVideoElement): Promise<void> {
  const anyVideo = v as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number
  }
  if (typeof anyVideo.requestVideoFrameCallback === 'function') {
    return new Promise((resolve) => {
      anyVideo.requestVideoFrameCallback!(() => resolve())
    })
  }
  return new Promise((resolve) => setTimeout(resolve, 50))
}
