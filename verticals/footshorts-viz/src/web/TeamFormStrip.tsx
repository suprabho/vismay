'use client';

import type { CSSProperties } from 'react';
import type { FixtureRow } from '../types';

function TeamFormPill({
  fixture,
  teamId,
  width,
  fill,
}: {
  fixture: FixtureRow;
  teamId: string;
  /** Fixed card width in px. Every card shares it; the opponent name truncates to fit. */
  width?: number;
  /** Stretch the card to fill its grid cell (uniform width without a fixed px value). */
  fill?: boolean;
}) {
  const isHome = fixture.home?.id === teamId;
  const teamGoals = isHome ? fixture.home_score : fixture.away_score;
  const oppGoals = isHome ? fixture.away_score : fixture.home_score;
  const opp = isHome ? fixture.away : fixture.home;
  const oppName = opp?.name ?? (isHome ? fixture.away_team_name : fixture.home_team_name) ?? 'TBD';

  let result: 'W' | 'D' | 'L' | '-' = '-';
  if (fixture.status === 'finished' && teamGoals !== null && oppGoals !== null) {
    result = teamGoals > oppGoals ? 'W' : teamGoals < oppGoals ? 'L' : 'D';
  }
  const resultColor =
    result === 'W' ? '#00D26A' : result === 'L' ? '#EF4444' : result === 'D' ? '#8E8E99' : '#24242E';
  const resultFg = result === 'W' || result === 'L' ? '#0B0B0F' : '#F4F4F5';
  const scoreText = teamGoals !== null && oppGoals !== null ? `${teamGoals}–${oppGoals}` : '—';

  // A card is "bounded" when its width is constrained (fixed px or a stretched
  // grid cell). Only then can the opponent name truncate; otherwise the card
  // grows to its content (legacy strip behaviour) and we cap the name at 62px.
  const bounded = width !== undefined || fill === true;
  const cardStyle: CSSProperties =
    width !== undefined ? { width } : fill ? { width: '100%' } : { minWidth: 80 };

  return (
    <div
      className="flex flex-col items-center rounded-xl border border-white/20 bg-white/10 px-3 py-2"
      style={cardStyle}
    >
      <div className="mb-1 h-[40px] w-[40px]">
        {opp?.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={opp.crest_url} alt="" className="h-full w-full object-contain" />
        ) : null}
      </div>
      <div className="text-base font-semibold text-text">{scoreText}</div>
      <div
        className={`mt-0.5 truncate text-xs text-text ${bounded ? 'w-full text-center' : 'max-w-[62px]'}`}
      >
        {isHome ? 'vs ' : '@ '}
        {oppName}
      </div>
      <div
        className="mt-1 rounded px-1.5 py-px text-[10px] font-bold"
        style={{ backgroundColor: resultColor, color: resultFg }}
      >
        {result}
      </div>
    </div>
  );
}

/** `strip` = one horizontally-scrolling row; `grid` = a rows × columns matrix. */
export type TeamFormLayout = 'strip' | 'grid';

type Props = {
  /** Finished fixtures for the team, oldest → newest. */
  fixtures: FixtureRow[];
  /** The team whose perspective (W/D/L, vs/@) the pills are shown from. */
  teamId: string;
  /** Section heading above the cards. */
  label?: string;
  /** Card arrangement. Defaults to `strip`. */
  layout?: TeamFormLayout;
  /** Grid only — cards per row. Defaults to 5. Ignored for `strip`. */
  columns?: number;
  /**
   * Grid only — caps the visible cards to `rows × columns`, keeping the most
   * recent fixtures (the array is oldest → newest). Omit to show every fixture
   * wrapped across as many rows as needed.
   */
  rows?: number;
  /**
   * Fixed card width in px, applied in both layouts. When set, every card is
   * exactly this wide (uniform); when omitted, grid cards stretch to share the
   * row equally and strip cards size to their content.
   */
  cardWidth?: number;
};

/**
 * Recent-result cards for one team — each card shows the opponent crest, score,
 * fixture side (vs/@) and a W/D/L badge.
 *
 * `strip` (default) lays the cards out in a single horizontally-scrolling row;
 * `grid` arranges them in a `columns`-wide matrix (capped to `rows × columns`
 * when `rows` is set). `cardWidth` forces a uniform fixed width in either mode.
 * Renders nothing when there are no fixtures.
 */
export function TeamFormStrip({
  fixtures,
  teamId,
  label = 'Form · last 5',
  layout = 'strip',
  columns = 5,
  rows,
  cardWidth,
}: Props) {
  if (fixtures.length === 0) return null;

  const cols = layout === 'grid' && columns > 0 ? columns : 5;
  // Cap to the most-recent rows × columns fixtures when both are set.
  const shown =
    layout === 'grid' && rows !== undefined && rows > 0
      ? fixtures.slice(-rows * cols)
      : fixtures;

  return (
    <div className="mt-4">
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.8px] text-text/80">
        {label}
      </div>
      {layout === 'grid' ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              cardWidth !== undefined
                ? `repeat(${cols}, ${cardWidth}px)`
                : `repeat(${cols}, minmax(0, 1fr))`,
            gap: '0.5rem',
            // Centre fixed-width columns; let auto columns span the full width.
            justifyContent: cardWidth !== undefined ? 'center' : 'stretch',
          }}
        >
          {shown.map((f) => (
            <TeamFormPill
              key={f.id}
              fixture={f}
              teamId={teamId}
              width={cardWidth}
              fill={cardWidth === undefined}
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shown.map((f) => (
            <TeamFormPill key={f.id} fixture={f} teamId={teamId} width={cardWidth} />
          ))}
        </div>
      )}
    </div>
  );
}
