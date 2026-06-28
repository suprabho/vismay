import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
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

// Mirrors web/MatchTile: self-sized at height 128, parents control width via a
// wrapper so the tile drops cleanly into horizontal strips, grids, or single
// callouts without baking a width into the component.
export function MatchTile({ fixture, competitionCrest = null }: Props) {
  const home = fixture.home;
  const away = fixture.away;
  const isFinished = fixture.status === 'finished';
  const isLive = fixture.status === 'live';

  // Background: home primary as base, away primary as gradient tail. Fall back
  // to the per-competition palette when no team color is known so the tile
  // still themes itself to the league instead of a flat surface.
  const fallback = getCompetitionPalette(fixture.competition_slug) ?? '#1F2030';
  const homeColor = home?.primary_color ?? fallback;
  const awayColor = away?.primary_color;
  const useGradient =
    !!awayColor && awayColor.toLowerCase() !== homeColor.toLowerCase();

  const competitionName = getCompetitionDisplayName(fixture.competition_slug);
  const homeName = home?.name ?? fixture.home_team_name ?? 'TBD';
  const awayName = away?.name ?? fixture.away_team_name ?? 'TBD';

  // Top-left label: score for finished games, LIVE pill, or local kick-off
  // time. Non-today fixtures pair the day with the time so a strip of tiles
  // self-orients and still tells you when the match starts.
  let topLabel: React.ReactNode;
  if (isFinished && fixture.home_score != null && fixture.away_score != null) {
    topLabel = (
      <Text
        className="text-white text-xs font-bold uppercase"
        style={{ letterSpacing: 1, fontVariant: ['tabular-nums'] }}
      >
        {fixture.home_score} – {fixture.away_score}
      </Text>
    );
  } else if (isLive) {
    topLabel = (
      <View className="flex-row items-center">
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: 'white',
            marginRight: 4,
          }}
        />
        <Text
          className="text-white text-xs font-bold uppercase"
          style={{ letterSpacing: 1 }}
        >
          LIVE
        </Text>
      </View>
    );
  } else {
    const d = new Date(fixture.kickoff_at);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const text = isToday
      ? time
      : `${d.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })} · ${time}`;
    topLabel = (
      <Text
        className="text-white text-xs font-bold uppercase"
        style={{ letterSpacing: 1 }}
      >
        {text}
      </Text>
    );
  }

  return (
    <View
      style={{
        height: 128,
        borderRadius: 12,
        overflow: 'hidden',
        padding: 16,
        backgroundColor: useGradient ? undefined : homeColor,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      }}
    >
      {useGradient ? (
        <LinearGradient
          colors={[homeColor, homeColor, awayColor!]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
      ) : null}

      {competitionCrest ? (
        <Image
          source={{ uri: competitionCrest }}
          style={{
            position: 'absolute',
            right: -16,
            bottom: -16,
            width: 112,
            height: 112,
            opacity: 0.25,
          }}
          contentFit="contain"
          pointerEvents="none"
        />
      ) : null}

      <View style={{ flex: 1, position: 'relative' }}>
        {topLabel}

        <View style={{ flex: 1, marginTop: 8, gap: 6, overflow: 'hidden' }}>
          <TeamRow name={homeName} crest={home?.crest_url ?? null} />
          <TeamRow name={awayName} crest={away?.crest_url ?? null} />
        </View>

        <Text
          numberOfLines={1}
          className="text-white/80 text-[10px] font-semibold uppercase"
          style={{ letterSpacing: 1 }}
        >
          {competitionName}
        </Text>
      </View>
    </View>
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: 'rgba(255,255,255,0.85)',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {crest ? (
          <Image
            source={{ uri: crest }}
            style={{ width: 16, height: 16 }}
            contentFit="contain"
          />
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        className="text-white text-sm font-semibold flex-shrink"
      >
        {name}
      </Text>
    </View>
  );
}
