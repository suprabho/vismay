import { ScrollView, Text, View } from 'react-native';
import type { FixtureRow } from '../types';
import { Crest } from './Crest';

/**
 * Recent-result cards for one team — each card shows the opponent crest, score,
 * fixture side (vs/@) and a W/D/L badge. Native port of web/TeamFormStrip.tsx.
 *
 * Strip layout only: the web sibling also offers a `grid` layout for the
 * fs:team-form story module, which no native surface needs yet.
 * Renders nothing when there are no fixtures.
 */

function TeamFormPill({
  fixture,
  teamId,
  width,
}: {
  fixture: FixtureRow;
  teamId: string;
  /** Fixed card width in px. Every card shares it; omit to size to content. */
  width?: number;
}) {
  const isHome = fixture.home?.id === teamId;
  const teamGoals = isHome ? fixture.home_score : fixture.away_score;
  const oppGoals = isHome ? fixture.away_score : fixture.home_score;
  const opp = isHome ? fixture.away : fixture.home;
  const oppName = opp?.name ?? (isHome ? fixture.away_team_name : fixture.home_team_name) ?? 'TBD';

  // Scores arrive as `null` from DB rows but `undefined` from generated story
  // configs (the pipeline omits them for unplayed fixtures) — treat both as
  // "no score" or they render literally as "undefined–undefined".
  let result: 'W' | 'D' | 'L' | '-' = '-';
  if (fixture.status === 'finished' && teamGoals != null && oppGoals != null) {
    result = teamGoals > oppGoals ? 'W' : teamGoals < oppGoals ? 'L' : 'D';
  }
  const resultColor =
    result === 'W' ? '#00D26A' : result === 'L' ? '#EF4444' : result === 'D' ? '#8E8E99' : '#24242E';
  const resultFg = result === 'W' || result === 'L' ? '#0B0B0F' : '#F4F4F5';
  const scoreText = teamGoals != null && oppGoals != null ? `${teamGoals}–${oppGoals}` : '—';

  return (
    <View
      className="items-center rounded-xl border border-white/20 bg-white/10 px-3 py-2"
      style={width !== undefined ? { width } : { minWidth: 80 }}
    >
      <Crest team={oppName} crestUrl={opp?.crest_url ?? undefined} size={40} style={{ marginBottom: 4 }} />
      <Text className="text-base font-semibold text-text">{scoreText}</Text>
      <Text className="mt-0.5 text-xs text-text" numberOfLines={1} style={{ maxWidth: 62 }}>
        {isHome ? 'vs ' : '@ '}
        {oppName}
      </Text>
      <View className="mt-1 rounded px-1.5" style={{ backgroundColor: resultColor, paddingVertical: 1 }}>
        <Text style={{ color: resultFg, fontSize: 10, fontWeight: '700' }}>{result}</Text>
      </View>
    </View>
  );
}

type Props = {
  /** Finished fixtures for the team, oldest → newest. */
  fixtures: FixtureRow[];
  /** The team whose perspective (W/D/L, vs/@) the pills are shown from. */
  teamId: string;
  /** Section heading above the cards. */
  label?: string;
  /** Fixed card width in px. When set, every card is exactly this wide
   *  (uniform); when omitted, cards size to their content. */
  cardWidth?: number;
};

export function TeamFormStrip({ fixtures, teamId, label = 'Form · last 5', cardWidth }: Props) {
  if (fixtures.length === 0) return null;

  return (
    <View className="mt-4">
      <Text className="mb-2.5 text-[11px] font-bold uppercase text-text/80" style={{ letterSpacing: 1.8 }}>
        {label}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {fixtures.map((f) => (
          <TeamFormPill key={f.id} fixture={f} teamId={teamId} width={cardWidth} />
        ))}
      </ScrollView>
    </View>
  );
}
