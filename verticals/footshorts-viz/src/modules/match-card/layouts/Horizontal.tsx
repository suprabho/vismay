'use client'

import type { CSSProperties } from 'react'
import { Crest } from '../../../data/Crest'
import type { MatchCardConfig } from '../index'
import { darken, resolveFixture, splitGradient, splitScoreNote } from './shared'

/**
 * Horizontal feature card — wider hero with a split home/away gradient (or a
 * provided backgroundImage). Big crests flanking the score, competition tag
 * watermarked behind. Modeled on the PSG vs Liverpool reference.
 */
export default function HorizontalLayout({ config }: { config: MatchCardConfig }) {
  const f = resolveFixture(config)
  const { main: scoreMain, note: scoreNote } = splitScoreNote(f.score)
  const bg = config.backgroundImage
    ? `linear-gradient(105deg, ${f.homeColor}cc 0%, ${darken(f.awayColor, 0.2)}cc 100%), url(${config.backgroundImage}) center/cover`
    : splitGradient(f.homeColor, f.awayColor)

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  }
  const card: CSSProperties = {
    width: 'min(640px, 100%)',
    aspectRatio: '16 / 7',
    borderRadius: '18px',
    padding: '18px 26px',
    background: bg,
    backgroundBlendMode: config.backgroundImage ? 'multiply' : 'normal',
    color: '#fff',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 16px 40px rgba(0,0,0,0.32)',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
    rowGap: '6px',
  }
  const competition: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  }
  const watermark: CSSProperties = {
    position: 'absolute',
    right: '-2%',
    bottom: '-30%',
    fontFamily: 'var(--font-mono)',
    fontWeight: 800,
    fontSize: 'clamp(60px, 18vw, 140px)',
    letterSpacing: '-0.04em',
    color: 'rgba(255,255,255,0.06)',
    lineHeight: 1,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  }
  const main: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    columnGap: '14px',
    zIndex: 1,
  }
  const team = (align: 'flex-start' | 'flex-end'): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    justifyContent: align,
    minWidth: 0,
  })
  const teamName: CSSProperties = {
    fontFamily: 'var(--font-sans, system-ui)',
    fontSize: 'clamp(14px, 2.2vw, 20px)',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    textShadow: '0 1px 8px rgba(0,0,0,0.4)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  }
  const scoreBox: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '88px',
    padding: '6px 12px',
    borderRadius: '10px',
    background: 'rgba(0,0,0,0.25)',
    backdropFilter: 'blur(6px)',
  }
  const scoreText: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(22px, 3vw, 30px)',
    fontWeight: 700,
    lineHeight: 1,
  }
  const kickoffText: CSSProperties = {
    marginTop: '4px',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.18em',
    color: 'rgba(255,255,255,0.75)',
  }

  return (
    <div style={wrap}>
      <div style={card}>
        {f.competitionName && <div style={competition}>{f.competitionName}</div>}
        {f.competitionTag && <div style={watermark}>{f.competitionTag}</div>}
        <div style={main}>
          <div style={team('flex-start')}>
            <Crest team={config.home} size={44} crestUrl={config.homeCrestUrl} />
            <span style={teamName}>{f.homeShort}</span>
          </div>
          <div style={scoreBox}>
            <span style={scoreText}>{f.scorePlaceholder ? (config.kickoff ?? 'vs') : scoreMain}</span>
            {!f.scorePlaceholder && scoreNote && <span style={kickoffText}>{scoreNote}</span>}
            {!f.scorePlaceholder && config.kickoff && (
              <span style={kickoffText}>{config.statusLabel ?? 'FT'}</span>
            )}
          </div>
          <div style={team('flex-end')}>
            <span style={teamName}>{f.awayShort}</span>
            <Crest team={config.away} size={44} crestUrl={config.awayCrestUrl} />
          </div>
        </div>
      </div>
    </div>
  )
}
