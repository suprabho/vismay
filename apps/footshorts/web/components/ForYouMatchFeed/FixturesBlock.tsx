import { MatchRow, MatchTile, TieCard, buildBracket } from '@vismay/footshorts-viz/web';
import type { FixtureRow } from '@/lib/useFixtures';
import { useLeagueCrestMap } from '@/lib/useLeagueCrestMap';

// Knockout when the migration's phase column says so, or — for rows that
// haven't been re-ingested yet — when a stage is present and isn't one of the
// non-knockout stage codes football-data.org uses.
function isKnockoutFixture(f: FixtureRow): boolean {
  if (f.phase) return f.phase === 'knockout';
  if (!f.stage) return false;
  return f.stage !== 'GROUP_STAGE' && f.stage !== 'LEAGUE_STAGE';
}

type Props = {
  fixtures: FixtureRow[];
  // 'row' (default) — compact MatchRow list. 'tile' — horizontally scrolling
  // colorful MatchTile strip, used for upcoming sections in the For You feed.
  display?: 'row' | 'tile';
  // Watermark crest passed through to each MatchTile. When omitted, tiles
  // fall back to whatever crest is available from the shared league map.
  competitionCrest?: string | null;
};

export function FixturesBlock({
  fixtures,
  display = 'row',
  competitionCrest,
}: Props) {
  if (fixtures.length === 0) return null;
  // Whole section is one phase (groupRound already filters to a single
  // matchday or stage), so checking the first fixture is enough.
  if (isKnockoutFixture(fixtures[0]!)) {
    const bracket = buildBracket(fixtures);
    const ties = bracket?.rounds[0]?.ties ?? [];
    return (
      <div className="flex flex-col gap-2">
        {ties.map((tie) => (
          <TieCard key={tie.legs.map((l) => l.id).join('|')} tie={tie} />
        ))}
      </div>
    );
  }
  if (display === 'tile') {
    return <TileStrip fixtures={fixtures} competitionCrest={competitionCrest} />;
  }
  return (
    <div className="rounded-lg border border-white/20 bg-white/10">
      {fixtures.map((f) => (
        <MatchRow key={f.id} fixture={f} />
      ))}
    </div>
  );
}

function TileStrip({
  fixtures,
  competitionCrest,
}: {
  fixtures: FixtureRow[];
  competitionCrest?: string | null;
}) {
  // When the parent didn't pre-supply a crest (e.g. mixed-league strips in
  // TeamCard), look one up per fixture from the shared league→crest map.
  const { data: crestMap = {} } = useLeagueCrestMap();
  return (
    <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex gap-3 px-1">
        {fixtures.map((f) => (
          <div key={f.id} className="w-56 shrink-0 sm:w-60">
            <MatchTile
              fixture={f}
              competitionCrest={competitionCrest ?? crestMap[f.competition_slug] ?? null}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
