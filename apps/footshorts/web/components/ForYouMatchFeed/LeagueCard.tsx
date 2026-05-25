import Link from 'next/link';
import { stageLabel } from '@vismay/footshorts-viz/web';
import type { LeagueSection } from '@/lib/useFollowedFixtures';
import { CollapsedHeader, SectionLabel } from './CardShell';
import { FixturesBlock } from './FixturesBlock';
import { relativeDateLabel } from './relativeDateLabel';

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

export function LeagueCard({ section }: { section: LeagueSection }) {
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
        {section.nextMatchday.length > 0 ? (
          <div className="mt-4">
            <SectionLabel
              text={
                section.nextMatchdayNumber != null
                  ? `Matchday ${section.nextMatchdayNumber} · Upcoming`
                  : section.nextStage
                    ? `${stageLabel(section.nextStage)} · Upcoming`
                    : 'Upcoming'
              }
            />
            <FixturesBlock
              fixtures={section.nextMatchday}
              display="tile"
              competitionCrest={section.entity.crest_url}
            />
          </div>
        ) : null}
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
            <FixturesBlock fixtures={section.lastMatchday} />
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
