import { Text, View } from 'react-native';
import type { FixtureEvent } from '../types';

type Props = {
  events: FixtureEvent[];
  /** Empty-state copy shown when there are no events to render. */
  emptyText?: string;
};

// Mirrors web/MatchTimeline.tsx: goals are the headline, cards/subs add texture,
// `var` rows are dropped as noise. Order within a minute keeps goals first so a
// goal+booking in the same minute reads goal-then-card.
const RENDERED_TYPES: ReadonlySet<FixtureEvent['type']> = new Set(['goal', 'card', 'subst']);
const TYPE_RANK: Record<string, number> = { goal: 0, subst: 1, card: 2, var: 3 };

// Card colours match web's bg-yellow-400 / bg-red-500 — set inline so we don't
// depend on those palette steps being present in the native tailwind config.
const YELLOW = '#facc15';
const RED = '#ef4444';

function minuteLabel(e: FixtureEvent): string {
  return e.extra_minute != null ? `${e.minute}+${e.extra_minute}'` : `${e.minute}'`;
}

function isRedCard(e: FixtureEvent): boolean {
  return e.type === 'card' && /red/i.test(e.detail ?? '');
}

function EventGlyph({ event }: { event: FixtureEvent }) {
  if (event.type === 'goal') {
    // Own goals are dimmed so they don't read as the scorer's team's goal.
    const own = /own/i.test(event.detail ?? '');
    return <Text style={own ? { opacity: 0.6 } : undefined}>⚽</Text>;
  }
  if (event.type === 'card') {
    return (
      <View
        style={{
          width: 9,
          height: 12,
          borderRadius: 1,
          backgroundColor: isRedCard(event) ? RED : YELLOW,
        }}
      />
    );
  }
  // subst
  return <Text className="text-accent">⇄</Text>;
}

function EventDetail({ event, align }: { event: FixtureEvent; align: 'left' | 'right' }) {
  const primary = event.player_name ?? 'Unknown';
  // For goals the assist is the secondary line; for subs it's the player coming
  // on. Penalties/own goals get a small qualifier so the score makes sense.
  const qualifier =
    event.type === 'goal' && event.detail && /penalty|own/i.test(event.detail)
      ? ` (${/own/i.test(event.detail) ? 'OG' : 'pen'})`
      : '';
  const secondary =
    event.type === 'goal' && event.assist_name
      ? `assist: ${event.assist_name}`
      : event.type === 'subst' && event.assist_name
        ? `on: ${event.assist_name}`
        : null;

  const textAlign = align === 'right' ? 'right' : 'left';
  return (
    <View className="flex-1" style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text className="text-sm font-medium text-text" numberOfLines={1} style={{ textAlign }}>
        {primary}
        {qualifier ? <Text className="text-muted">{qualifier}</Text> : null}
      </Text>
      {secondary ? (
        <Text className="text-[11px] text-muted" numberOfLines={1} style={{ textAlign }}>
          {secondary}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Chronological match timeline: home-side events on the left, away-side on the
 * right, the minute down the middle. Mirrors web/MatchTimeline.tsx and the
 * home/away split MatchRow uses, styled with the same brand tokens.
 */
export function MatchTimeline({ events, emptyText = 'No match events recorded.' }: Props) {
  const rendered = events
    .filter((e) => RENDERED_TYPES.has(e.type))
    .slice()
    .sort((a, b) => {
      const am = a.minute + (a.extra_minute ?? 0) / 100;
      const bm = b.minute + (b.extra_minute ?? 0) / 100;
      if (am !== bm) return am - bm;
      return (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9);
    });

  if (rendered.length === 0) {
    return <Text className="text-sm text-muted">{emptyText}</Text>;
  }

  return (
    <View>
      {rendered.map((e, i) => {
        const onLeft = e.side !== 'away'; // home and side-less events sit left
        const isLast = i === rendered.length - 1;
        return (
          <View
            key={e.id}
            className={`flex-row items-center py-2 ${isLast ? '' : 'border-b border-white/15'}`}
          >
            <View className="flex-1 flex-row items-center justify-end" style={{ gap: 8 }}>
              {onLeft ? (
                <>
                  <EventDetail event={e} align="right" />
                  <EventGlyph event={e} />
                </>
              ) : null}
            </View>
            <Text
              className="text-xs text-muted"
              style={{ width: 48, textAlign: 'center', fontVariant: ['tabular-nums'] }}
            >
              {minuteLabel(e)}
            </Text>
            <View className="flex-1 flex-row items-center" style={{ gap: 8 }}>
              {!onLeft ? (
                <>
                  <EventGlyph event={e} />
                  <EventDetail event={e} align="left" />
                </>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
