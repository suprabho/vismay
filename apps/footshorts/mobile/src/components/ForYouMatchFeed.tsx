import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useFollowedFixtures,
  type LeagueSection,
  type TeamSection,
} from '@/lib/useFollowedFixtures';
import type { FixtureRow } from '@/lib/useFixtures';
import type { Entity } from '@/lib/useEntities';
import { useLeagueCrestMap } from '@/lib/useLeagueCrestMap';
import {
  MatchRow,
  MatchTile,
  TeamFormStrip,
  TieCard,
  buildBracket,
  stageLabel,
  competitionFollowLabel,
} from '@vismay/footshorts-viz/native';

// Match web's "Upcoming" tile strip: wide enough that two tiles read clearly
// side-by-side on a phone, with comfortable gap and snap stops.
const TILE_WIDTH = 240;
const TILE_GAP = 12;

type Card =
  | { kind: 'league'; id: string; entity: Entity; section: LeagueSection }
  | { kind: 'team'; id: string; entity: Entity; section: TeamSection };

type Props = { topGap: number; bottomGap: number };

const PAGE_SIZE = 5;
const COLLAPSED_ROW = 104; // collapsed card + margin
const SPRING_CARD = { damping: 24, stiffness: 260, mass: 0.9 };
const SPRING_LAYOUT = { damping: 22, stiffness: 210, mass: 0.95 };

function haptic(kind: 'light' | 'drop' = 'light') {
  if (Platform.OS === 'android') {
    Vibration.vibrate(kind === 'drop' ? 18 : 10);
  } else {
    Vibration.vibrate(kind === 'drop' ? [0, 12] : [0, 8]);
  }
}

export function ForYouMatchFeed({ topGap, bottomGap }: Props) {
  const { data, isLoading, error } = useFollowedFixtures();

  const cards: Card[] = useMemo(() => {
    if (!data) return [];
    const leagues: Card[] = data.leagues.map((s) => ({
      kind: 'league',
      id: s.entity.id,
      entity: s.entity,
      section: s,
    }));
    const teams: Card[] = data.teams.map((s) => ({
      kind: 'team',
      id: s.entity.id,
      entity: s.entity,
      section: s,
    }));
    return [...leagues, ...teams];
  }, [data]);

  const [order, setOrder] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const ids = cards.map((c) => c.id);
    setOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !kept.includes(id));
      const next = [...kept, ...added];
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) {
        return prev;
      }
      return next;
    });
  }, [cards]);

  const orderedCards = useMemo(
    () => order.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c),
    [order, cards],
  );

  const moveCard = (fromIndex: number, toIndex: number) => {
    setOrder((prev) => {
      const clamped = Math.max(0, Math.min(prev.length - 1, toIndex));
      if (clamped === fromIndex) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      if (!item) return prev;
      next.splice(clamped, 0, item);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ paddingTop: topGap }}>
        <Text className="text-text text-lg mb-2">Could not load</Text>
        <Text className="text-muted text-sm text-center">{(error as Error).message}</Text>
      </View>
    );
  }

  if (orderedCards.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ paddingTop: topGap }}>
        <Text className="text-text text-lg mb-2">Nothing here yet</Text>
        <Text className="text-muted text-sm text-center">
          Follow leagues and teams to see recent results and upcoming fixtures.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{
        paddingTop: topGap,
        paddingBottom: bottomGap,
        paddingHorizontal: 14,
      }}
      showsVerticalScrollIndicator={false}
    >
      {orderedCards.map((card, i) => (
        <WalletCard
          key={card.id}
          card={card}
          index={i}
          total={orderedCards.length}
          expanded={expandedId === card.id}
          anyDragging={draggingId !== null}
          isDragging={draggingId === card.id}
          onToggle={() => toggleExpanded(card.id)}
          onDragStart={() => setDraggingId(card.id)}
          onDragEnd={() => setDraggingId(null)}
          onDrop={(to) => moveCard(i, to)}
        />
      ))}
      <View style={{ height: 12 }} />
    </ScrollView>
  );
}

type WalletCardProps = {
  card: Card;
  index: number;
  total: number;
  expanded: boolean;
  anyDragging: boolean;
  isDragging: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: (to: number) => void;
};

function WalletCard({
  card,
  index,
  total,
  expanded,
  anyDragging,
  isDragging,
  onToggle,
  onDragStart,
  onDragEnd,
  onDrop,
}: WalletCardProps) {
  const translateY = useSharedValue(0);
  const lift = useSharedValue(0); // 0..1 drag state
  const recede = useSharedValue(0); // 0..1 when OTHER card is dragging

  useEffect(() => {
    recede.value = withTiming(anyDragging && !isDragging ? 1 : 0, { duration: 160 });
  }, [anyDragging, isDragging, recede]);

  const pan = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      lift.value = withSpring(1, SPRING_CARD);
      runOnJS(onDragStart)();
      runOnJS(haptic)('light');
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const slots = Math.round(e.translationY / COLLAPSED_ROW);
      const to = Math.max(0, Math.min(total - 1, index + slots));
      if (to !== index) {
        runOnJS(onDrop)(to);
        runOnJS(haptic)('drop');
      }
      translateY.value = withSpring(0, SPRING_CARD);
      lift.value = withSpring(0, SPRING_CARD);
      runOnJS(onDragEnd)();
    });

  const tap = Gesture.Tap()
    .maxDuration(280)
    .maxDistance(12)
    .onEnd((_e, success) => {
      if (success) runOnJS(onToggle)();
    });

  const gesture = Gesture.Race(pan, tap);

  const opacity = useDerivedValue(() => 1 - recede.value * 0.25);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
    zIndex: lift.value > 0 ? 1000 : 0,
  }));

  const palette = paletteFor(card.entity.primary_color);
  const shadowStyle = useAnimatedStyle(() => ({
    borderRadius: 22,
    shadowColor: palette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25 + lift.value * 0.35 + (expanded ? 0.1 : 0),
    shadowRadius: 14 + lift.value * 18,
    elevation: 3 + lift.value * 18 + (expanded ? 4 : 0),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        layout={LinearTransition.springify().damping(SPRING_LAYOUT.damping).stiffness(SPRING_LAYOUT.stiffness)}
        style={[animatedStyle, { marginBottom: 10 }]}
      >
        <CardShell entity={card.entity} expanded={expanded} shadowStyle={shadowStyle}>
          {card.kind === 'league' ? (
            <LeagueCardContent section={card.section} expanded={expanded} />
          ) : (
            <TeamCardContent section={card.section} expanded={expanded} />
          )}
        </CardShell>
      </Animated.View>
    </GestureDetector>
  );
}

function CardShell({
  entity,
  shadowStyle,
  children,
}: {
  entity: Entity;
  expanded: boolean;
  shadowStyle: unknown;
  children: React.ReactNode;
}) {
  const palette = paletteFor(entity.primary_color);

  return (
    <Animated.View style={shadowStyle as any}>
      <View
        style={{
          borderRadius: 22,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: palette.border,
        }}
      >
        <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: palette.base }} />
        {/* Brand top wash for depth */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 120, backgroundColor: palette.top }}
        />
        {/* Edge-lit top hairline */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: palette.hairline }}
        />
        <View style={{ padding: 16 }}>{children}</View>
      </View>
    </Animated.View>
  );
}

type Palette = {
  base: string; // full card bg
  top: string; // top band overlay
  border: string;
  hairline: string;
  shadow: string;
  accent: string;
  accentText: string;
};

function paletteFor(hex: string | null | undefined): Palette {
  const fallback: Palette = {
    base: 'rgba(22,22,29,0.92)',
    top: 'rgba(255,255,255,0.05)',
    border: '#2A2A34',
    hairline: 'rgba(255,255,255,0.10)',
    shadow: '#000000',
    accent: 'rgba(255,255,255,0.10)',
    accentText: '#F4F4F5',
  };
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return {
    base: hex + 'CC', // ~80%
    top: hex + 'FF', // solid brand color band at top for depth
    border: hex + 'FF',
    hairline: 'rgba(255,255,255,0.22)',
    shadow: hex,
    accent: 'rgba(255,255,255,0.18)',
    accentText: '#F4F4F5',
  };
}

function ExpandableBody({
  expanded,
  children,
}: {
  expanded: boolean;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(expanded ? 1 : 0);
  const measuredH = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(expanded ? 1 : 0, {
      damping: 26,
      stiffness: 240,
      mass: 0.9,
      overshootClamping: true,
    });
  }, [expanded, progress]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0 && Math.abs(measuredH.value - h) > 0.5) {
      measuredH.value = h;
    }
  };

  const animatedStyle = useAnimatedStyle(() => ({
    height: measuredH.value * progress.value,
    opacity: progress.value,
    overflow: 'hidden' as const,
  }));

  return (
    <View style={{ position: 'relative' }}>
      {/* Hidden measurement layer — gives us the true expanded height */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }}
        onLayout={onLayout}
      >
        {children}
      </View>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </View>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <Text
      style={{
        color: 'rgba(244,244,245,0.78)',
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1.8,
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {text}
    </Text>
  );
}

function BrandChip({
  label,
  palette,
}: {
  label: string;
  palette: Palette;
}) {
  return (
    <View
      style={{
        backgroundColor: palette.accent,
        borderColor: palette.border,
        borderWidth: 1,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text style={{ color: palette.accentText, fontSize: 11, fontWeight: '600', letterSpacing: 0.2 }}>
        {label}
      </Text>
    </View>
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
  const palette = paletteFor(entity.primary_color);
  const crestSize = 42;
  return (
    <View className="flex-row items-center">
      {entity.crest_url ? (
        <View
          style={{
            width: crestSize + 10,
            height: crestSize + 10,
            borderRadius: (crestSize + 10) / 2,
            backgroundColor: 'rgba(255,255,255,0.40)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Image
            source={{ uri: entity.crest_url }}
            style={{ width: crestSize, height: crestSize }}
            contentFit="contain"
          />
        </View>
      ) : (
        <View style={{ width: crestSize + 10, height: crestSize + 10, marginRight: 12 }} />
      )}
      <View className="flex-1 pr-2">
        <Text
          style={{ color: '#F4F4F5', fontSize: 17, fontWeight: '700', letterSpacing: 0.1 }}
          numberOfLines={1}
        >
          {primary}
        </Text>
        {secondary ? (
          <Text
            style={{ color: 'rgba(244,244,245,0.65)', fontSize: 12, marginTop: 2 }}
            numberOfLines={1}
          >
            {secondary}
          </Text>
        ) : null}
      </View>
      {chipLabel ? <BrandChip label={chipLabel} palette={palette} /> : null}
    </View>
  );
}

function LeagueCardContent({
  section,
  expanded,
}: {
  section: LeagueSection;
  expanded: boolean;
}) {
  const router = useRouter();
  const nextChip = nextLeagueChip(section);
  const subtitle = section.entity.country;
  // For league cards every fixture is from this same competition — using
  // the section entity's crest as the watermark is both correct and saves
  // a network hop for the strip.
  const leagueCrestMap = useMemo<Record<string, string>>(
    () =>
      section.entity.crest_url
        ? { [section.entity.slug]: section.entity.crest_url }
        : {},
    [section.entity.slug, section.entity.crest_url],
  );

  return (
    <View>
      <CollapsedHeader
        entity={section.entity}
        primary={section.entity.name}
        secondary={subtitle}
        chipLabel={nextChip}
      />
      <ExpandableBody expanded={expanded}>
        {section.lastMatchday.length > 0 ? (
          <View className="mt-5">
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
          </View>
        ) : null}

        {section.nextMatchday.length > 0 ? (
          <View
            className="mt-4 p-4 rounded-xl border-white/20 overflow-hidden"
          >
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <SectionLabel
              text={
                section.nextMatchdayNumber != null
                  ? `Matchday ${section.nextMatchdayNumber} · Upcoming`
                  : section.nextStage
                    ? `${stageLabel(section.nextStage)} · Upcoming`
                    : 'Upcoming'
              }
            />
            {/* Match web's FixturesBlock display='tile' — a competition-themed
                MatchTile strip instead of a row carousel, with knockout ties
                rendered as a bracket when present. */}
            <FixturesBlock
              fixtures={section.nextMatchday}
              display="tile"
              crestMap={leagueCrestMap}
            />
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push(`/league/${section.entity.slug}`)}
          hitSlop={8}
          className="w-full items-center mt-4 self-start"
        >
          <Text className="text-accent text-sm font-semibold">
            {competitionFollowLabel(section.entity.slug)}
          </Text>
        </Pressable>
      </ExpandableBody>
    </View>
  );
}

function TeamCardContent({ section, expanded }: { section: TeamSection; expanded: boolean }) {
  const router = useRouter();
  const teamId = section.entity.id;
  const formItems = [...section.past].reverse();
  const upcoming = section.upcoming.slice(0, 3);
  const nextChip = nextTeamChip(section);
  const subtitle = teamSubtitle(section);
  // Team fixtures span multiple competitions (league + cups). Fetch the
  // shared slug→crest map so each MatchTile gets the right watermark.
  // React Query dedupes the call across every team card on the screen.
  const { data: crestMap } = useLeagueCrestMap();

  return (
    <View>
      <CollapsedHeader
        entity={section.entity}
        primary={section.entity.name}
        secondary={subtitle}
        chipLabel={nextChip}
      />
      {formItems.length > 0 ? (
        <View style={{ flexDirection: 'row', marginTop: 12, marginLeft: 64 }}>
          {formItems.slice(-5).map((f) => (
            <FormDot key={f.id} fixture={f} teamId={teamId} />
          ))}
        </View>
      ) : null}
      <ExpandableBody expanded={expanded}>
        {formItems.length > 0 ? (
          <View className="mt-1">
            <TeamFormStrip fixtures={formItems} teamId={teamId} />
          </View>
        ) : null}

        {upcoming.length > 0 ? (
          <View className="mt-4">
            <SectionLabel text="Next 3" />
            {/* Match web's TeamCard "Next 3" — a horizontal MatchTile strip
                themed by each fixture's competition, falling back to a bracket
                for multi-leg knockout ties. */}
            <FixturesBlock fixtures={upcoming} display="tile" crestMap={crestMap ?? {}} />
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push(`/team/${section.entity.slug}`)}
          hitSlop={8}
          className="mt-4 self-start"
        >
          <Text className="text-accent text-sm font-semibold">View team →</Text>
        </Pressable>
      </ExpandableBody>
    </View>
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
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        marginRight: 5,
      }}
    />
  );
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
  if (ms < 0) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  if (diffDays === 0) {
    return `today ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays === 1) {
    return `tmrw ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Knockout when the migration's phase column says so, or — for rows that
// haven't been re-ingested yet — when a stage is present and isn't one of the
// non-knockout stage codes football-data.org uses. Mirrors web's FixturesBlock.
function isKnockoutFixture(f: FixtureRow): boolean {
  if (f.phase) return f.phase === 'knockout';
  if (!f.stage) return false;
  return f.stage !== 'GROUP_STAGE' && f.stage !== 'LEAGUE_STAGE';
}

// Mobile twin of web's FixturesBlock — routes one phase's fixtures to the right
// renderer. Knockout fixtures become TieCards (aggregate + per-leg rows); a
// 'tile' section whose ties are all single-leg (e.g. an upcoming Final, or any
// scheduled knockout before its second leg exists) drops through to the
// colourful MatchTile strip so it matches the rest of the feed.
function FixturesBlock({
  fixtures,
  display = 'row',
  crestMap,
}: {
  fixtures: FixtureRow[];
  display?: 'row' | 'tile';
  crestMap?: Record<string, string>;
}) {
  if (fixtures.length === 0) return null;
  // Whole section is one phase (the followed-fixtures hook already filters to a
  // single matchday or stage), so checking the first fixture is enough.
  if (isKnockoutFixture(fixtures[0]!)) {
    const bracket = buildBracket(fixtures);
    const ties = bracket?.rounds[0]?.ties ?? [];
    const allSingleLeg = ties.length > 0 && ties.every((t) => t.legs.length === 1);
    if (!(display === 'tile' && allSingleLeg)) {
      return (
        <View style={{ gap: 8 }}>
          {ties.map((tie) => (
            <TieCard key={tie.legs.map((l) => l.id).join('|')} tie={tie} />
          ))}
        </View>
      );
    }
  }
  if (display === 'tile') {
    return <MatchTileStrip fixtures={fixtures} crestMap={crestMap ?? {}} />;
  }
  return <MatchdayPager fixtures={fixtures} />;
}

// Horizontal MatchTile strip — the mobile twin of web's "Upcoming" /
// "Next 3" tile rendering on For You cards (see ForYouMatchFeed/FixturesBlock
// with display='tile'). Themed by competition crest watermark when we have
// one in the slug→crest map.
function MatchTileStrip({
  fixtures,
  crestMap,
}: {
  fixtures: FixtureRow[];
  crestMap: Record<string, string>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={TILE_WIDTH + TILE_GAP}
      decelerationRate="fast"
      contentContainerStyle={{ paddingRight: 4 }}
    >
      {fixtures.map((f, i) => (
        <View
          key={f.id}
          style={{
            width: TILE_WIDTH,
            marginRight: i === fixtures.length - 1 ? 0 : TILE_GAP,
          }}
        >
          <MatchTile fixture={f} competitionCrest={crestMap[f.competition_slug] ?? null} />
        </View>
      ))}
    </ScrollView>
  );
}

function MatchdayPager({ fixtures }: { fixtures: FixtureRow[] }) {
  const pages = useMemo(() => {
    const out: FixtureRow[][] = [];
    for (let i = 0; i < fixtures.length; i += PAGE_SIZE) {
      out.push(fixtures.slice(i, i + PAGE_SIZE));
    }
    return out;
  }, [fixtures]);

  if (pages.length <= 1) {
    return (
      <View className='bg-white/20 border border-white/50'>
        {(pages[0] ?? []).map((f) => (
          <MatchRow key={f.id} fixture={f} />
        ))}
      </View>
    );
  }

  return <Carousel pages={pages} />;
}

function Carousel({ pages }: { pages: FixtureRow[][] }) {
  const [width, setWidth] = useState(0);
  const [pageIdx, setPageIdx] = useState(0);
  const offsetX = useSharedValue(0);
  const startX = useSharedValue(0);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== width) setWidth(w);
  };

  const updatePage = (i: number) => {
    if (i !== pageIdx) setPageIdx(i);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onStart(() => {
      startX.value = offsetX.value;
    })
    .onUpdate((e) => {
      // Rubber-band at edges
      const minX = -(pages.length - 1) * width;
      const maxX = 0;
      let next = startX.value + e.translationX;
      if (next > maxX) next = maxX + (next - maxX) * 0.35;
      if (next < minX) next = minX + (next - minX) * 0.35;
      offsetX.value = next;
    })
    .onEnd((e) => {
      if (width <= 0) return;
      const projected = offsetX.value + e.velocityX * 0.12;
      const target = Math.round(-projected / width);
      const clamped = Math.max(0, Math.min(pages.length - 1, target));
      offsetX.value = withSpring(-clamped * width, {
        damping: 26,
        stiffness: 220,
        mass: 0.9,
        velocity: e.velocityX,
      });
      runOnJS(updatePage)(clamped);
    });

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offsetX.value }],
  }));

  return (
    <View>
      <View onLayout={onContainerLayout} style={{ overflow: 'hidden' }}>
        {width > 0 ? (
          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                { flexDirection: 'row', width: width * pages.length },
                trackStyle,
              ]}
            >
              {pages.map((pg, i) => (
                <View key={i} style={{ width }}>
                  {pg.map((f) => (
                    <MatchRow key={f.id} fixture={f} />
                  ))}
                </View>
              ))}
            </Animated.View>
          </GestureDetector>
        ) : (
          // First paint: render page 1 inline to capture width, then swap to carousel
          <View>
            {(pages[0] ?? []).map((f) => (
              <MatchRow key={f.id} fixture={f} />
            ))}
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 10 }}>
        {pages.map((_, i) => (
          <View
            key={i}
            style={{
              width: i === pageIdx ? 18 : 6,
              height: 6,
              borderRadius: 3,
              marginHorizontal: 3,
              backgroundColor: i === pageIdx ? '#F4F4F5' : 'rgba(244,244,245,0.30)',
            }}
          />
        ))}
      </View>
    </View>
  );
}
