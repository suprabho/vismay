'use client';

import Link from 'next/link';
import { MatchRow } from './MatchRow';
import {
  useFollowedFixtures,
  type LeagueSection,
  type TeamSection,
} from '@/lib/useFollowedFixtures';
import type { FixtureRow } from '@/lib/useFixtures';
import type { Entity } from '@/lib/useEntities';

type Palette = {
  base: string;
  top: string;
  border: string;
  hairline: string;
};

function paletteFor(hex: string | null | undefined): Palette {
  const fallback: Palette = {
    base: 'rgba(22,22,29,0.92)',
    top: 'rgba(255,255,255,0.05)',
    border: '#2A2A34',
    hairline: 'rgba(255,255,255,0.10)',
  };
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return {
    base: hex + 'CC',
    top: hex,
    border: hex,
    hairline: 'rgba(255,255,255,0.22)',
  };
}

// football-data.org stage codes → human labels. Anything unmapped falls back
// to title-cased words ("ROUND_OF_32" → "Round Of 32") so new stages don't
// crash the UI even if we forget to extend this map.
function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    PRELIMINARY_ROUND: 'Preliminary Round',
    FIRST_QUALIFYING_ROUND: '1st Qualifying Round',
    SECOND_QUALIFYING_ROUND: '2nd Qualifying Round',
    THIRD_QUALIFYING_ROUND: '3rd Qualifying Round',
    PLAY_OFFS: 'Play-offs',
    PLAY_OFF_ROUND: 'Play-off Round',
    GROUP_STAGE: 'Group Stage',
    LEAGUE_STAGE: 'League Phase',
    LAST_16: 'Round of 16',
    ROUND_OF_16: 'Round of 16',
    ROUND_OF_32: 'Round of 32',
    QUARTER_FINALS: 'Quarter-finals',
    SEMI_FINALS: 'Semi-finals',
    THIRD_PLACE: 'Third Place',
    FINAL: 'Final',
  };
  if (map[stage]) return map[stage]!;
  return stage
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function relativeDateLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const ms = d.getTime() - now.getTime();
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTarget = new Date(d);
  startOfTarget.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startOfTarget.getTime() - startOfToday.getTime()) / day);
  if (ms < 0) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (diffDays === 0) {
    return `today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `tmrw ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function nextLeagueChip(section: LeagueSection): string | null {
  const next = section.nextMatchday[0];
  if (next) return relativeDateLabel(next.kickoff_at).toUpperCase();
  const last = section.lastMatchday[0];
  if (last) {
    const d = new Date(last.kickoff_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
    return `LAST · ${d.toUpperCase()}`;
  }
  return null;
}

function nextTeamChip(section: TeamSection): string | null {
  const next = section.upcoming[0];
  if (next) return relativeDateLabel(next.kickoff_at).toUpperCase();
  return null;
}

function teamSubtitle(section: TeamSection): string | null {
  const teamId = section.entity.id;
  const next = section.upcoming[0];
  if (next) {
    const isHome = next.home?.id === teamId;
    const opp = isHome ? next.away : next.home;
    const oppName = opp?.name ?? (isHome ? next.away_team_name : next.home_team_name) ?? 'TBD';
    return `${isHome ? 'vs' : '@'} ${oppName}`;
  }
  const last = section.past[0];
  if (last && last.home_score !== null && last.away_score !== null) {
    const isHome = last.home?.id === teamId;
    const opp = isHome ? last.away : last.home;
    const oppName = opp?.name ?? (isHome ? last.away_team_name : last.home_team_name) ?? 'TBD';
    const tg = isHome ? last.home_score : last.away_score;
    const og = isHome ? last.away_score : last.home_score;
    return `Last: ${tg}–${og} ${isHome ? 'vs' : '@'} ${oppName}`;
  }
  return null;
}

function CardShell({ entity, children }: { entity: Entity; children: React.ReactNode }) {
  const palette = paletteFor(entity.primary_color);
  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{ borderColor: palette.border, backgroundColor: palette.base }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[120px]"
        style={{ backgroundColor: palette.top, opacity: 0.35 }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ backgroundColor: palette.hairline }}
      />
      <div className="relative p-4">{children}</div>
    </div>
  );
}

function CollapsedHeader({
  entity,
  primary,
  secondary,
  chipLabel,
}: {
  entity: Entity;
  primary: string;
  secondary: string | null;
  chipLabel: string | null;
}) {
  return (
    <div className="flex items-center">
      <div className="mr-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white/40">
        {entity.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entity.crest_url} alt="" className="h-[42px] w-[42px] object-contain" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pr-2">
        <div className="truncate text-[17px] font-bold tracking-tight text-text">{primary}</div>
        {secondary ? (
          <div className="mt-0.5 truncate text-xs text-text/65">{secondary}</div>
        ) : null}
      </div>
      {chipLabel ? (
        <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-text">
          {chipLabel}
        </span>
      ) : null}
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.8px] text-text/80">
      {text}
    </div>
  );
}

function FormDot({ fixture, teamId }: { fixture: FixtureRow; teamId: string }) {
  const isHome = fixture.home?.id === teamId;
  const tg = isHome ? fixture.home_score : fixture.away_score;
  const og = isHome ? fixture.away_score : fixture.home_score;
  let color = '#8E8E9955';
  if (fixture.status === 'finished' && tg !== null && og !== null) {
    color = tg > og ? '#00D26A' : tg < og ? '#EF4444' : '#8E8E99';
  }
  return <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />;
}

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
    <div className="mr-2 flex min-w-[80px] flex-col items-center rounded-xl border border-border px-3 py-2">
      <div className="mb-1 h-[22px] w-[22px]">
        {opp?.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={opp.crest_url} alt="" className="h-full w-full object-contain" />
        ) : null}
      </div>
      <div className="text-xs font-semibold text-text">{scoreText}</div>
      <div className="mt-0.5 max-w-[62px] truncate text-[10px] text-muted">
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

function LeagueCardContent({ section }: { section: LeagueSection }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none">
        <CollapsedHeader
          entity={section.entity}
          primary={section.entity.name}
          secondary={section.entity.country}
          chipLabel={nextLeagueChip(section)}
        />
      </summary>

      <div className="mt-4">
        {section.lastMatchday.length > 0 ? (
          <div className="mt-4">
            <SectionLabel
              text={
                section.lastMatchdayNumber != null
                  ? `Matchday ${section.lastMatchdayNumber} · Results`
                  : section.lastStage
                    ? `${stageLabel(section.lastStage)} · Results`
                    : 'Recent results'
              }
            />
            <div className="rounded-lg border border-white/20 bg-white/10">
              {section.lastMatchday.map((f) => (
                <MatchRow key={f.id} fixture={f} />
              ))}
            </div>
          </div>
        ) : null}

        {section.nextMatchday.length > 0 ? (
          <div className="mt-4 rounded-lg border border-white/20 bg-white/10 p-3">
            <SectionLabel
              text={
                section.nextMatchdayNumber != null
                  ? `Matchday ${section.nextMatchdayNumber} · Upcoming`
                  : section.nextStage
                    ? `${stageLabel(section.nextStage)} · Upcoming`
                    : 'Upcoming'
              }
            />
            {section.nextMatchday.map((f) => (
              <MatchRow key={f.id} fixture={f} />
            ))}
          </div>
        ) : null}

        <Link
          href={`/league/${section.entity.slug}`}
          className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
        >
          View league →
        </Link>
      </div>
    </details>
  );
}

function TeamCardContent({ section }: { section: TeamSection }) {
  const teamId = section.entity.id;
  const formItems = [...section.past].reverse();
  const upcoming = section.upcoming.slice(0, 3);

  return (
    <details className="group">
      <summary className="cursor-pointer list-none">
        <CollapsedHeader
          entity={section.entity}
          primary={section.entity.name}
          secondary={teamSubtitle(section)}
          chipLabel={nextTeamChip(section)}
        />
        {formItems.length > 0 ? (
          <div className="ml-16 mt-3 flex">
            {formItems.slice(-5).map((f) => (
              <FormDot key={f.id} fixture={f} teamId={teamId} />
            ))}
          </div>
        ) : null}
      </summary>

      <div className="mt-4">
        {formItems.length > 0 ? (
          <div className="mt-4">
            <SectionLabel text="Form · last 5" />
            <div className="flex overflow-x-auto pb-1">
              {formItems.map((f) => (
                <TeamFormPill key={f.id} fixture={f} teamId={teamId} />
              ))}
            </div>
          </div>
        ) : null}

        {upcoming.length > 0 ? (
          <div className="mt-4">
            <SectionLabel text="Next 3" />
            {upcoming.map((f) => (
              <MatchRow key={f.id} fixture={f} />
            ))}
          </div>
        ) : null}

        <Link
          href={`/team/${section.entity.slug}`}
          className="mt-4 inline-block text-sm font-semibold text-accent hover:underline"
        >
          View team →
        </Link>
      </div>
    </details>
  );
}

export function ForYouMatchFeed() {
  const { data, isLoading, error } = useFollowedFixtures();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="mb-2 text-lg text-text">Could not load</p>
        <p className="text-sm text-muted">{(error as Error).message}</p>
      </div>
    );
  }

  const leagues = data?.leagues ?? [];
  const teams = data?.teams ?? [];

  if (leagues.length === 0 && teams.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="mb-2 text-lg text-text">Nothing here yet</p>
        <p className="text-sm text-muted">
          Follow leagues and teams to see recent results and upcoming fixtures.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {leagues.map((s) => (
        <CardShell key={s.entity.id} entity={s.entity}>
          <LeagueCardContent section={s} />
        </CardShell>
      ))}
      {teams.map((s) => (
        <CardShell key={s.entity.id} entity={s.entity}>
          <TeamCardContent section={s} />
        </CardShell>
      ))}
    </div>
  );
}
