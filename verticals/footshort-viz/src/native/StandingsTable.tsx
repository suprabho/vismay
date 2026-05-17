import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { StandingRow } from '../types';

type Props = {
  rows: StandingRow[];
  /**
   * Compact layout for narrow containers. Drops the W/D/L/GD columns;
   * keeps position, team, played, and points. Default false.
   */
  compact?: boolean;
};

function HeaderCell({ label, width }: { label: string; width: number }) {
  return (
    <View style={{ width }}>
      <Text className="text-muted text-[10px] text-center">{label}</Text>
    </View>
  );
}

function NumCell({ value, width, bold }: { value: number | string; width: number; bold?: boolean }) {
  return (
    <View style={{ width }}>
      <Text className={`text-text text-xs text-center ${bold ? 'font-semibold' : ''}`}>{value}</Text>
    </View>
  );
}

export function StandingsTable({ rows, compact = false }: Props) {
  const router = useRouter();

  return (
    <View className="bg-surface border border-border rounded-xl overflow-hidden">
      <View className="flex-row px-3 py-2 border-b border-border bg-bg">
        <View style={{ width: 28 }}>
          <Text className="text-muted text-[10px]">#</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text className="text-muted text-[10px]">Team</Text>
        </View>
        <HeaderCell label="P" width={28} />
        {!compact && <HeaderCell label="W" width={24} />}
        {!compact && <HeaderCell label="D" width={24} />}
        {!compact && <HeaderCell label="L" width={24} />}
        {!compact && <HeaderCell label="GD" width={32} />}
        <HeaderCell label="Pts" width={32} />
      </View>

      {rows.map((r) => {
        const teamSlug = r.team?.slug;
        const content = (
          <View className="flex-row items-center px-3 py-2.5 border-b border-border/50">
            <View style={{ width: 28 }}>
              <Text className="text-text text-xs">{r.position}</Text>
            </View>
            <View style={{ flex: 1 }} className="flex-row items-center">
              {r.team?.crest_url ? (
                <Image
                  source={{ uri: r.team.crest_url }}
                  style={{ width: 18, height: 18, marginRight: 8 }}
                  contentFit="contain"
                />
              ) : null}
              <Text className="text-text text-xs flex-shrink" numberOfLines={1}>
                {r.team?.name ?? '—'}
              </Text>
            </View>
            <NumCell value={r.played} width={28} />
            {!compact && <NumCell value={r.won} width={24} />}
            {!compact && <NumCell value={r.draw} width={24} />}
            {!compact && <NumCell value={r.lost} width={24} />}
            {!compact && <NumCell value={r.goal_difference} width={32} />}
            <NumCell value={r.points} width={32} bold />
          </View>
        );
        if (!teamSlug) {
          return (
            <View key={r.team_id}>
              {content}
            </View>
          );
        }
        return (
          <Pressable key={r.team_id} onPress={() => router.push(`/team/${teamSlug}`)}>
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}
