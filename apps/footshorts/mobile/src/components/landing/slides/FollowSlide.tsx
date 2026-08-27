import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { EntityCard } from '@vismay/footshorts-viz/native';

import { useLandingCrests, type LandingCrest } from '@/lib/useLandingContent';
import { Card } from '../ui';
import { SlideCopy } from './SlideCopy';

const COLS = 2;
const TILES = 6;
const GAP = 10;
const CARD_PADDING = 14;
/** Screen gutter the carousel already applies to every slide. */
const SCREEN_GUTTER = 24;

/** Cards that get followed over the loop, in the order they light up. */
const PICK_ORDER = [0, 3];
/** Beats held after the last pick before the selection clears and replays. */
const HOLD_BEATS = 3;
const BEAT_MS = 950;

const ENTER_MS = 420;
const ENTER_STAGGER = 60;

/**
 * Mocked onboarding picker: the real `EntityCard` from the leagues/teams
 * screens, filled with live competition badges and club crests, with a couple
 * selecting themselves and clearing on a loop.
 *
 * The cards are the shared component rather than a copy, so this stays honest
 * about what signing up actually looks like. Logos are live rows from the
 * public `entities` table, clubs in the same curated `popularity` order the
 * teams onboarding screen uses; `FALLBACK_LOGOS` covers a cold start with no
 * network.
 */
export function FollowSlide() {
  const { data: crests } = useLandingCrests();
  const { width } = useWindowDimensions();

  // EntityCard fills its wrapper, so the column has to be a real width. Seed
  // from the window so the first frame is already right, then correct against
  // the measured content box.
  const [gridWidth, setGridWidth] = useState(
    width - SCREEN_GUTTER * 2 - CARD_PADDING * 2,
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setGridWidth(w);
  };

  const logos = useMemo(() => pickGrid(crests ?? []), [crests]);
  const picked = usePickCycle();
  const column = Math.floor((gridWidth - GAP * (COLS - 1)) / COLS);

  return (
    <>
      <Card>
        <View
          style={{ padding: CARD_PADDING }}
          // Decorative mock — the cards are real Pressables, so keep them out
          // of the tap and screen-reader paths.
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {/* Padding sits on the parent so this box measures as the content
              width — onLayout reports the padded width, which would size the
              columns too wide and wrap the grid to one per row. */}
          <View
            onLayout={onLayout}
            className="flex-row flex-wrap justify-between"
            style={{ rowGap: GAP }}
          >
            {logos.map((logo, i) => (
              <PickCard
                key={logo.id}
                logo={logo}
                width={column}
                index={i}
                selected={picked.has(i)}
              />
            ))}
          </View>
        </View>
      </Card>

      <SlideCopy
        heading="Follow the clubs, not the noise."
        body="Pick leagues, teams and players. Your feed is only them — scores, standings, kickoffs."
      />
    </>
  );
}

/**
 * Alternate competitions with clubs so the grid says "leagues and teams"
 * rather than filling with whichever list is longer. Falls back to the static
 * set when the query hasn't landed or came back short.
 */
function pickGrid(crests: LandingCrest[]): LandingCrest[] {
  const leagues = crests.filter((c) => c.type === 'league');
  const teams = crests.filter((c) => c.type === 'team');
  const out: LandingCrest[] = [];
  for (let i = 0; out.length < TILES && i < TILES; i++) {
    const next = i % 2 === 0 ? leagues[i / 2] : teams[(i - 1) / 2];
    if (next) out.push(next);
  }
  return out.length === TILES ? out : FALLBACK_LOGOS;
}

/**
 * Drives the selection loop: cards light up one per beat in `PICK_ORDER`, hold,
 * then clear together and replay. Plain React state rather than a worklet
 * because it drives which cards animate, not the animation itself.
 */
function usePickCycle(): ReadonlySet<number> {
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setBeat((b) => (b + 1) % (PICK_ORDER.length + HOLD_BEATS)),
      BEAT_MS,
    );
    return () => clearInterval(id);
  }, []);

  return useMemo(
    () => new Set(PICK_ORDER.slice(0, Math.min(beat, PICK_ORDER.length))),
    [beat],
  );
}

function PickCard({
  logo,
  width,
  index,
  selected,
}: {
  logo: LandingCrest;
  width: number;
  index: number;
  selected: boolean;
}) {
  const enter = useSharedValue(0);
  const pick = useSharedValue(0);

  // Staggered entrance, once per mount — the slide is built when the carousel
  // is, so this plays while the user is still on the first card.
  useEffect(() => {
    enter.value = withDelay(
      index * ENTER_STAGGER,
      withTiming(1, { duration: ENTER_MS, easing: Easing.bezier(0.22, 1, 0.36, 1) }),
    );
  }, [enter, index]);

  useEffect(() => {
    pick.value = withTiming(selected ? 1 : 0, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [pick, selected]);

  // EntityCard swaps its border and fill on `selected` with no transition of
  // its own; the settle makes a card being picked read as a press.
  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [
      { translateY: (1 - enter.value) * 10 },
      { scale: (0.9 + enter.value * 0.1) * (1 + pick.value * 0.04) },
    ],
  }));

  return (
    <Animated.View style={[{ width }, style]}>
      <EntityCard
        name={logo.name}
        crestUrl={logo.crestUrl}
        selected={selected}
        onPress={noop}
      />
    </Animated.View>
  );
}

function noop() {}

/**
 * Cold-start stand-in. `crestUrl: null` makes EntityCard fall back to its
 * initial treatment, so this path issues no network requests.
 */
const FALLBACK_LOGOS: LandingCrest[] = [
  { id: 'fb-premier-league', slug: 'premier-league', name: 'Premier League', type: 'league', crestUrl: null, color: '#37003C' },
  { id: 'fb-manchester-city', slug: 'manchester-city', name: 'Manchester City', type: 'team', crestUrl: null, color: '#6CABDD' },
  { id: 'fb-champions-league', slug: 'champions-league', name: 'Champions League', type: 'league', crestUrl: null, color: '#0E1E5B' },
  { id: 'fb-real-madrid', slug: 'real-madrid', name: 'Real Madrid', type: 'team', crestUrl: null, color: '#00529F' },
  { id: 'fb-la-liga', slug: 'primera-division', name: 'La Liga', type: 'league', crestUrl: null, color: '#0E1E5B' },
  { id: 'fb-liverpool', slug: 'liverpool', name: 'Liverpool', type: 'team', crestUrl: null, color: '#C8102E' },
];
