'use client'

import { forwardRef, type CSSProperties, type ReactNode } from 'react'
import { themes, themeToVars } from '@footshorts/brand'
import { AuraBackground } from '@vismay/ui'
import { LayerView, type ComposerLayer } from '@vismay/viz-admin'
import { FootshortsLogo } from '../FootshortsLogo'
import { FootshortsDataProvider, type FootshortsCardData } from '../modules/dataContext'
import { proxiedImage } from '../modules/shared'
import {
  OUTPUT_SIZE,
  RENDER_SCALE,
  type CardBackground,
  type CardFrameConfig,
  type LogoSize,
  type LogoVariant,
} from '../types'

/** "#RRGGBB" / "#RGB" → "R G B" channels for the `--sf-color-*` runtime vars. */
function hexToChannels(hex: string): string | null {
  const h = hex.trim().replace(/^#/, '')
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) return null
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`
}

const LOGO_PX: Record<LogoSize, number> = { sm: 22, md: 30, lg: 42 }

function wordmarkColor(variant: LogoVariant): string {
  switch (variant) {
    case 'light':
      return '#FFFFFF'
    case 'dark':
      return '#0B0B0F'
    default:
      return 'var(--sf-color-text)'
  }
}

function BrandMark({ size, variant }: { size: LogoSize; variant: LogoVariant }) {
  const px = LOGO_PX[size]
  return (
    <span className="flex items-center gap-1.5">
      <FootshortsLogo size={px} knockout={variant === 'light'} />
      {variant !== 'mark' && (
        <span
          className="font-bold tracking-tight"
          style={{ color: wordmarkColor(variant), fontSize: px * 0.46 }}
        >
          Footshorts
        </span>
      )}
    </span>
  )
}

function Header({
  eyebrow,
  logoSize,
  logoVariant,
}: {
  eyebrow?: string | null
  logoSize: LogoSize
  logoVariant: LogoVariant
}) {
  return (
    <div className="flex shrink-0 items-center justify-between px-5 pt-5">
      <span className="truncate text-[13px] font-bold uppercase tracking-[1.6px] text-muted">
        {eyebrow ?? ' '}
      </span>
      <BrandMark size={logoSize} variant={logoVariant} />
    </div>
  )
}

function Footer({ handle }: { handle: string }) {
  return (
    <div className="flex shrink-0 items-center justify-between px-5 pb-5 pt-2">
      <span className="text-[12px] font-medium text-muted">{handle}</span>
      <span className="h-1.5 w-10 rounded-full bg-accent" />
    </div>
  )
}

/** Decorative backdrop behind the layer stack. News thumbnail (proxied) / AI image
 *  rasterize into the export; an aura embeds the animated iframe for the preview
 *  only (never captured). A scrim keeps content legible. */
function CardBackgroundLayer({ background, scrim }: { background: CardBackground; scrim: number }) {
  return (
    <div className="absolute inset-0 z-0" aria-hidden>
      {background.type === 'news' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={proxiedImage(background.url)} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : background.type === 'ai' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={background.dataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : background.type === 'aura' ? (
        <>
          <AuraBackground slug={background.slug} />
          <style>{`
            .bn-aura { position: absolute; inset: 0; overflow: hidden; }
            .bn-aura iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; display: block; background: transparent; }
          `}</style>
        </>
      ) : null}
      {scrim > 0 && <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${scrim})` }} />}
    </div>
  )
}

/**
 * The on-brand card surface for the multi-layer composer: theme vars + ratio
 * sizing + header/footer chrome + optional background, wrapping the foreground
 * layer stack (`children`, built by the shell's PreviewPane). The layers render
 * through the registry inside `FootshortsDataProvider` so they resolve their
 * picks. Exposes the capture node via ref for PNG export.
 */
export const CardFrame = forwardRef<
  HTMLDivElement,
  {
    frame: CardFrameConfig
    data: FootshortsCardData
    children: ReactNode
    /** `overlay`-placement layers (badges) rendered absolutely over the whole card. */
    overlays?: ComposerLayer[]
  }
>(function CardFrame({ frame, data, children, overlays = [] }, ref) {
  const out = OUTPUT_SIZE[frame.ratio]
  const renderW = Math.round(out.w * RENDER_SCALE)
  const renderH = Math.round(out.h * RENDER_SCALE)

  const vars = themeToVars(themes[frame.themeName]) as Record<string, string>
  const accentChannels = frame.accentHex ? hexToChannels(frame.accentHex) : null
  if (accentChannels) vars['--sf-color-accent'] = accentChannels

  const style: CSSProperties = {
    ...vars,
    width: renderW,
    height: renderH,
    fontFamily: 'var(--sf-font-sans)',
  }

  const background =
    frame.background && frame.background.type !== 'none' ? frame.background : null
  const scrim = frame.backgroundScrim ?? 0.5

  return (
    <div ref={ref} className="relative flex flex-col overflow-hidden bg-bg text-text" style={style}>
      {background && <CardBackgroundLayer background={background} scrim={scrim} />}
      <FootshortsDataProvider value={data}>
        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <Header eyebrow={frame.eyebrow} logoSize={frame.logoSize} logoVariant={frame.logoVariant} />
          <div className="min-h-0 flex-1 py-2">{children}</div>
          <Footer handle={frame.handle} />
        </div>
      </FootshortsDataProvider>
      {overlays.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30" aria-hidden>
          {overlays.map((l) => (
            <LayerView key={l.id} layer={l.layer} />
          ))}
        </div>
      )}
    </div>
  )
})
