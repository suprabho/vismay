'use client';

import type { FixtureRow } from '../types';
import {
  getCompetitionDisplayName,
  getCompetitionPalette,
} from '../competitionMeta';

type Props = {
  fixture: FixtureRow;
  // Crest washed into the bottom-right corner. Pass null/omit for no watermark.
  competitionCrest?: string | null;
};

// Self-sized at h-32; parents control width via a wrapper (`w-56`, `w-full`,
// etc.) so the tile drops cleanly into horizontal strips, grids, or single
// callouts without baking a width into the component.
export function MatchTile({ fixture, competitionCrest = null }: Props) {
  const home = fixture.home;
  const away = fixture.away;
  const isFinished = fixture.status === 'finished';
  const isLive = fixture.status === 'live';

  // Background: home primary as base, away primary as gradient tail. Fall back
  // to the per-competition palette when no team color is known so the tile
  // still themes itself to the league instead of a flat surface.
  const fallback =
    getCompetitionPalette(fixture.competition_slug) ?? '#1F2030';
  const homeColor = home?.primary_color ?? fallback;
  const awayColor = away?.primary_color;
  const background =
    awayColor && awayColor.toLowerCase() !== homeColor.toLowerCase()
      ? `linear-gradient(135deg, ${homeColor} 0%, ${homeColor} 55%, ${awayColor} 100%)`
      : homeColor;

  // Top-left label: score for finished games, LIVE pill, or local kick-off
  // time. Day label for non-today fixtures so a strip of tiles self-orients.
  let topLabel: React.ReactNode;
  if (isFinished && fixture.home_score !== null && fixture.away_score !== null) {
    topLabel = (
      <span className="font-bold tabular-nums">
        {fixture.home_score} – {fixture.away_score}
      </span>
    );
  } else if (isLive) {
    topLabel = (
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        LIVE
      </span>
    );
  } else {
    const d = new Date(fixture.kickoff_at);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    topLabel = isToday
      ? d.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
  }

  const competitionName = getCompetitionDisplayName(fixture.competition_slug);
  const homeName = home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = away?.name ?? fixture.away_team_name ?? 'TBD';

  return (
    <div
      className="relative h-32 overflow-hidden rounded-xl p-4 text-white shadow-xl"
      style={{ background }}
    >
      {competitionCrest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={competitionCrest}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-4 -bottom-4 h-28 w-28 object-contain opacity-25"
        />
      ) : null}

      <div className="relative flex h-full flex-col">
        <div className="text-xs font-bold uppercase tracking-wider">
          {topLabel}
        </div>

        <div className="mt-2 flex-1 space-y-1.5 overflow-hidden">
          <TeamRow name={homeName} crest={home?.crest_url ?? null} />
          <TeamRow name={awayName} crest={away?.crest_url ?? null} />
        </div>

        <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/80">
          {competitionName}
        </div>
      </div>
    </div>
  );
}

function TeamRow({
  name,
  crest,
}: {
  name: string;
  crest: string | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/85">
        {crest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={crest} alt="" className="h-4 w-4 object-contain" />
        ) : null}
      </span>
      <span className="truncate text-sm font-semibold">{name}</span>
    </div>
  );
}
