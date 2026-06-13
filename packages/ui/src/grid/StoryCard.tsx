import type { ComponentType, CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import { AuraBackground } from './AuraBackground'
import {
  cardThemeStyle,
  storyCardTheme,
  DEFAULT_CARD_THEME,
  fmtMonth,
} from './theme'
import type { StoryCardData } from './types'

export interface StoryCardProps
  extends Omit<HTMLAttributes<HTMLElement>, 'style' | 'children'> {
  data: StoryCardData
  /** 0-based position — rendered as the padded card number badge. */
  n: number
  big: boolean
  /** When set the card is a link; otherwise it renders as a plain div. */
  href?: string
  /** Link component to use when `href` is set (e.g. next/link). Defaults to `a`. */
  linkComponent?: ElementType
  className?: string
  style?: CSSProperties
  /** Extra content layered over the card — e.g. admin quick-action overlay. */
  children?: ReactNode
}

/**
 * A single themed bento story card. Renders the same markup the vizmaya.fyi
 * home grid uses (number badge, topic pill, date, italic serif title, optional
 * subtitle, READ cta) over the story's own theme + aura/thumbnail background.
 */
export function StoryCard({
  data: s,
  n,
  big,
  href,
  linkComponent,
  className = '',
  style,
  children,
  ...rest
}: StoryCardProps) {
  const ct = s.theme ? storyCardTheme(s.theme) : DEFAULT_CARD_THEME
  const hasAura = Boolean(s.aura)
  const hasThumb = !hasAura && Boolean(s.thumbnail)
  // A cover thumbnail carries its own look; an optional per-story text colour
  // keeps the card's title/READ legible over it without recolouring the body.
  const textColor = hasThumb ? s.thumbnailTextColor : undefined

  // Polymorphic root: a Link/<a> when `href` is set, otherwise a <div>. Cast to
  // a permissive component type so the spread of drag handlers / style / children
  // typechecks across the intrinsic-element and custom-link cases.
  const root: ElementType = href ? linkComponent ?? 'a' : 'div'
  const Root = root as ComponentType<Record<string, unknown> & { children?: ReactNode }>
  const rootProps = href ? { href } : {}

  return (
    <Root
      className={`bcard story themed ${big ? 'big' : 'sm'}${className ? ` ${className}` : ''}`}
      style={{ ...cardThemeStyle(ct, textColor), ...style }}
      {...rootProps}
      {...rest}
    >
      {hasAura && s.aura && <AuraBackground slug={s.aura} />}
      {hasThumb && s.thumbnail && (
        <div className="bn-thumb" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={s.thumbnail} alt="" loading="lazy" />
        </div>
      )}
      <div className="bcard-top">
        <div className="bcard-k">
          <span className="bcard-n">{String(n + 1).padStart(2, '0')}</span>
          {s.topic && <span className="bcard-topic">{s.topic}</span>}
          <span className="bcard-date">{fmtMonth(s.date)}</span>
        </div>
        <h3 className="bcard-h">{s.title}</h3>
        {big && <p className="bcard-p">{s.subtitle}</p>}
      </div>
      <div className="bcard-a">Read →</div>
      {children}
    </Root>
  )
}

export default StoryCard
