import Link from 'next/link';
import type { TeamSection } from '@/lib/useFollowedFixtures';
import type { FixtureRow } from '@/lib/useFixtures';
import { CollapsedHeader, SectionLabel } from './CardShell';
import { FixturesBlock } from './FixturesBlock';
import { relativeDateLabel } from './relativeDateLabel';

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

export function TeamCard({ section }: { section: TeamSection }) {
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

        {upcoming.length > 0 ? (
          <div className="mt-4">
            <SectionLabel text="Next 3" />
            <FixturesBlock fixtures={upcoming} display="tile" />
          </div>
        ) : null}
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
