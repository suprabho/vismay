'use client';

import type { FixtureRow } from '../types';

function TeamFormPill({ fixture, teamId }: { fixture: FixtureRow; teamId: string }) {
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

  return (
    <div className="mr-2 flex min-w-[80px] flex-col items-center rounded-xl border border-white/20 bg-white/10 px-3 py-2">
      <div className="mb-1 h-[40px] w-[40px]">
        {opp?.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={opp.crest_url} alt="" className="h-full w-full object-contain" />
        ) : null}
      </div>
      <div className="text-base font-semibold text-text">{scoreText}</div>
      <div className="mt-0.5 max-w-[62px] truncate text-xs text-text">
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

type Props = {
  /** Finished fixtures for the team, oldest → newest. */
  fixtures: FixtureRow[];
  /** The team whose perspective (W/D/L, vs/@) the pills are shown from. */
  teamId: string;
  /** Section heading above the strip. */
  label?: string;
};

/**
 * Horizontally-scrolling strip of recent-result pills for one team — each pill
 * shows the opponent crest, score, fixture side (vs/@) and a W/D/L badge.
 * Renders nothing when there are no fixtures.
 */
export function TeamFormStrip({ fixtures, teamId, label = 'Form · last 5' }: Props) {
  if (fixtures.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.8px] text-text/80">
        {label}
      </div>
      <div className="flex overflow-x-auto pb-1">
        {fixtures.map((f) => (
          <TeamFormPill key={f.id} fixture={f} teamId={teamId} />
        ))}
      </div>
    </div>
  );
}
