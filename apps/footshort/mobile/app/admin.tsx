import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdminStats, PublisherStat, DayPoint, TopEntity } from '@/lib/useAdminStats';

function Stat({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'warn' | 'ok' }) {
  const color = tone === 'warn' ? 'text-amber-400' : tone === 'ok' ? 'text-accent' : 'text-text';
  return (
    <View className="bg-surface border border-border rounded-lg px-4 py-3 mr-2 mb-2" style={{ minWidth: 110 }}>
      <Text className="text-muted text-xs uppercase tracking-wide mb-1">{label}</Text>
      <Text className={`${color} text-xl font-bold`}>{value}</Text>
    </View>
  );
}

function freshnessTone(mins: number | null): 'ok' | 'warn' | 'default' {
  if (mins == null) return 'default';
  if (mins > 120) return 'warn';
  return 'ok';
}

function formatMins(m: number | null): string {
  if (m == null) return '—';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function BarByDay({ data }: { data: DayPoint[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <View className="flex-row items-end" style={{ height: 80 }}>
      {data.map((d) => {
        const h = (d.count / max) * 70;
        return (
          <View key={d.day} className="flex-1 items-center">
            <View style={{ height: h, width: 8, backgroundColor: '#00D26A', opacity: d.count > 0 ? 1 : 0.15, borderRadius: 2 }} />
            <Text className="text-muted" style={{ fontSize: 8, marginTop: 2 }}>
              {d.day.slice(5)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function PublisherRow({ s }: { s: PublisherStat }) {
  const failureRate = s.total > 0 ? (s.failed / s.total) * 100 : 0;
  const imgRate = s.total > 0 ? (s.withImage / s.total) * 100 : 0;
  const tagRate = s.total > 0 ? (s.withTags / s.total) * 100 : 0;
  return (
    <View className="bg-surface border border-border rounded-lg px-4 py-3 mb-2">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-text font-semibold">{s.publisher}</Text>
        <Text className="text-muted text-xs">{s.total} articles</Text>
      </View>
      <View className="flex-row">
        <Text className="text-muted text-xs mr-4">
          Fail <Text className={failureRate > 10 ? 'text-amber-400' : 'text-text'}>{failureRate.toFixed(0)}%</Text>
        </Text>
        <Text className="text-muted text-xs mr-4">
          Image <Text className="text-text">{imgRate.toFixed(0)}%</Text>
        </Text>
        <Text className="text-muted text-xs">
          Tagged <Text className="text-text">{tagRate.toFixed(0)}%</Text>
        </Text>
      </View>
    </View>
  );
}

function TopEntityRow({ e }: { e: TopEntity }) {
  return (
    <View className="flex-row items-center bg-surface border border-border rounded-lg px-3 py-2 mr-2 mb-2">
      {e.crest_url ? (
        <Image source={{ uri: e.crest_url }} style={{ width: 18, height: 18, marginRight: 8 }} contentFit="contain" />
      ) : null}
      <Text className="text-text text-sm mr-2">{e.name}</Text>
      <Text className="text-muted text-xs">{e.article_count}</Text>
    </View>
  );
}

export default function AdminScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, error, refetch, isFetching } = useAdminStats();

  if (isLoading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View className="flex-1 bg-bg items-center justify-center px-6">
        <Text className="text-text text-base mb-2">Could not load stats</Text>
        <Text className="text-muted text-sm text-center">{(error as Error)?.message ?? 'Unknown error'}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-2">
        <Pressable onPress={() => router.back()} hitSlop={8} className="w-10">
          <Text className="text-text text-base">←</Text>
        </Pressable>
        <Text className="text-text text-lg font-semibold">Pipeline</Text>
        <Pressable onPress={() => refetch()} hitSlop={8} className="w-10 items-end">
          <Text className="text-muted text-sm">{isFetching ? '…' : '↻'}</Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
      >
        <Text className="text-muted text-xs uppercase tracking-wide mb-2">Freshness</Text>
        <View className="flex-row flex-wrap mb-4">
          <Stat
            label="Last ingest"
            value={formatMins(data.freshness.minutesSinceLatest) + ' ago'}
            tone={freshnessTone(data.freshness.minutesSinceLatest)}
          />
          <Stat label="Total articles" value={data.articles.total} />
        </View>

        <Text className="text-muted text-xs uppercase tracking-wide mb-2">Articles</Text>
        <View className="flex-row flex-wrap mb-4">
          <Stat label="Summarized" value={data.articles.summarized} tone="ok" />
          <Stat label="Failed" value={data.articles.failed} tone={data.articles.failed > 0 ? 'warn' : 'default'} />
          <Stat label="Pending" value={data.articles.pending} />
          <Stat label="With image" value={`${data.articles.total ? Math.round((data.articles.withImage / data.articles.total) * 100) : 0}%`} />
          <Stat label="Tagged" value={`${data.articles.total ? Math.round((data.articles.withTags / data.articles.total) * 100) : 0}%`} />
        </View>

        <Text className="text-muted text-xs uppercase tracking-wide mb-2">Entities</Text>
        <View className="flex-row flex-wrap mb-4">
          <Stat label="Leagues" value={data.entities.leagues} />
          <Stat label="Teams" value={data.entities.teams} />
          <Stat label="Players" value={data.entities.players} />
        </View>

        <Text className="text-muted text-xs uppercase tracking-wide mb-2">Ingested · last 14 days</Text>
        <View className="bg-surface border border-border rounded-lg p-4 mb-4">
          <BarByDay data={data.byDay} />
        </View>

        <Text className="text-muted text-xs uppercase tracking-wide mb-2">By publisher</Text>
        {data.byPublisher.map((s) => (
          <PublisherRow key={s.publisher} s={s} />
        ))}

        <Text className="text-muted text-xs uppercase tracking-wide mb-2 mt-4">Top tagged entities</Text>
        <View className="flex-row flex-wrap mb-4">
          {data.topEntities.map((e) => (
            <TopEntityRow key={e.entity_id} e={e} />
          ))}
          {data.topEntities.length === 0 ? (
            <Text className="text-muted text-sm">No tags yet — run the ingest worker.</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
