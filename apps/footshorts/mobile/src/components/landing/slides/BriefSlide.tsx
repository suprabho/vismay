import { useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { darkenHex } from '@vismay/footshorts-viz/native';
import { terrace } from '@footshorts/brand';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { FeedCardEntity } from '@footshorts/shared/schemas';
import type { LandingBrief } from '@/lib/useLandingContent';

import { font } from '../fonts';
import { colorsTooClose, pickBandEntities, relativeTime } from '../entity';
import { Crest } from '../ui';
import { SlideCopy } from './SlideCopy';

/** Screen gutter the carousel already applies to every slide. */
const SCREEN_GUTTER = 24;
const HERO_RATIO = 10 / 16;
const CARD_RADIUS = 16;

/** Cards visible behind the front one, and how far each is offset. */
const PEEK = 2;
const PEEK_RISE = 10;
const PEEK_SCALE = 0.04;
/** Reaches 0 at the parking slot, so queued cards are fully hidden. */
const PEEK_FADE = 1 / (PEEK + 1);

/** How long each brief holds before the deck deals the next one. */
const DEAL_MS = 2200;
const SETTLE_MS = 320;
const SETTLE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

const CREST_PLATE = 'rgba(255, 255, 255, 0.88)';

/**
 * The briefs deck — a native port of `BriefsCardStack` on web's /about-us: a
 * photo-led card with two more peeking behind it, over a `‹ n / total ›` pager.
 *
 * Every card is a real published article read from the public `articles` table,
 * the same one the logged-out Discover tab uses. Web drives the deck by drag;
 * here it deals itself, because the slide sits inside the story carousel's own
 * pan gesture and tap zones — a draggable deck would fight them for the same
 * horizontal swipe. The pager is chrome for the same reason.
 */
export function BriefSlide({ briefs }: { briefs: LandingBrief[] }) {
  const { width } = useWindowDimensions();
  const index = useDealCycle(briefs.length);

  const cardWidth = width - SCREEN_GUTTER * 2;
  const cardHeight = Math.round(cardWidth * HERO_RATIO) + BODY_HEIGHT;

  return (
    <>
      <View style={{ gap: 14 }}>
        {/* The peeking cards sit above the front one, so the box is taller than
            a card by exactly the deepest rise. */}
        <View style={{ height: cardHeight + PEEK * PEEK_RISE }}>
          {briefs.map((brief, i) => (
            <DeckCard
              key={brief.id}
              brief={brief}
              depth={(i - index + briefs.length) % briefs.length}
              total={briefs.length}
              width={cardWidth}
              height={cardHeight}
            />
          ))}
        </View>

        <Pager index={index} total={briefs.length} />
      </View>

      <SlideCopy
        heading="Sixty words. Then you know."
        body="Every story summarised to what happened and why it matters. Swipe for the next one."
      />
    </>
  );
}

/** Advances the top card on a timer; the carousel's own 5s tick is separate. */
function useDealCycle(total: number): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (total < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % total), DEAL_MS);
    return () => clearInterval(id);
  }, [total]);

  return total > 0 ? index % total : 0;
}

/**
 * Whether this card is the one just dealt away. Only true when the deck is
 * deeper than the peek — in a 3-card deck the previous front card is still
 * needed as the back peek, so nothing leaves and the deck just shuffles up.
 */
function isLeaving(depth: number, total: number): boolean {
  return total > PEEK + 1 && depth === total - 1;
}

/**
 * Where a card sits, given how far back in the deck it is. `-1` is the card
 * that was just dealt away; anything past the visible peek parks off-stage at
 * `PEEK + 1` waiting to be recycled to the back.
 */
function slot(depth: number, total: number): number {
  if (isLeaving(depth, total)) return -1;
  return Math.min(depth, PEEK + 1);
}

function DeckCard({
  brief,
  depth,
  total,
  width,
  height,
}: {
  brief: LandingBrief;
  depth: number;
  total: number;
  width: number;
  height: number;
}) {
  const target = slot(depth, total);
  const pos = useSharedValue(target);

  useEffect(() => {
    // Every real move walks the card one slot forward, so animate when the
    // slot decreases. The one increase is a card wrapping from dealt-away back
    // to the tail of the deck, which has to snap or it flies back across.
    if (target < pos.value) {
      pos.value = withTiming(target, { duration: SETTLE_MS, easing: SETTLE_EASING });
    } else {
      pos.value = target;
    }
  }, [pos, target]);

  const style = useAnimatedStyle(() => {
    const p = pos.value;
    // Dealt away: off to the left with a slight tilt, on its way out.
    const gone = Math.max(0, -p);
    const stacked = Math.max(0, p);
    return {
      opacity: gone > 0 ? 1 - gone : Math.max(0, 1 - stacked * PEEK_FADE),
      transform: [
        { translateX: gone * -width * 0.42 },
        { translateY: stacked * -PEEK_RISE },
        { scale: 1 - stacked * PEEK_SCALE },
        { rotate: `${gone * -6}deg` },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          bottom: 0,
          width,
          height,
          borderRadius: CARD_RADIUS,
          backgroundColor: terrace.colors.surface,
          borderWidth: 1,
          borderColor: terrace.colors.border,
          overflow: 'hidden',
          // The dealt-away card has to travel in front of the deck, not behind
          // it — its depth would otherwise put it at the very back.
          zIndex: isLeaving(depth, total) ? total + 1 : total - depth,
          shadowColor: '#1B1A17',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.14,
          shadowRadius: 20,
          elevation: 6,
        },
        style,
      ]}
    >
      <Hero brief={brief} height={Math.round(width * HERO_RATIO)} />

      <View style={{ padding: 16 }}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <View
            className="rounded-full border border-border"
            style={{ paddingVertical: 3, paddingHorizontal: 8 }}
          >
            <Text className="text-text" style={META} numberOfLines={1}>
              {brief.publisher}
            </Text>
          </View>
          <Text className="text-muted" style={META}>
            {relativeTime(brief.publishedAt)}
          </Text>
        </View>

        <Text
          className="text-text"
          numberOfLines={2}
          style={{ fontFamily: font.sansBold, fontSize: 15, lineHeight: 19, marginTop: 10 }}
        >
          {brief.headline}
        </Text>

        <Text
          className="text-muted"
          numberOfLines={3}
          style={{ fontFamily: font.sans, fontSize: 13, lineHeight: 18, marginTop: 8 }}
        >
          {brief.summary}
        </Text>
      </View>
    </Animated.View>
  );
}

const META = {
  fontFamily: font.sansMedium,
  fontSize: 10,
  letterSpacing: 1,
  textTransform: 'uppercase',
} as const;

/** Body height the card box is sized against — every text run is clamped. */
const BODY_HEIGHT = 16 + 18 + 10 + 38 + 8 + 54 + 16;

/**
 * The card's photo. Articles are only picked when they have one, but a remote
 * image can still fail on a cold start — that drops back to the two-club colour
 * band with crests, which is also what the offline stand-ins render.
 */
function Hero({ brief, height }: { brief: LandingBrief; height: number }) {
  const [failed, setFailed] = useState(false);

  if (brief.imageUrl && !failed) {
    return (
      <Image
        source={{ uri: brief.imageUrl }}
        style={{ width: '100%', height }}
        contentFit="cover"
        transition={200}
        onError={() => setFailed(true)}
      />
    );
  }
  return <ClubBand entities={pickBandEntities(brief.entities)} height={height} />;
}

type BandEntity = { entity: FeedCardEntity; color: string };

/**
 * Two-club diagonal, standing in for a missing photo.
 *
 * A brief doesn't always name two clubs, and two that do can share a colour —
 * any red-vs-red fixture. Both fall back to a darkened cast of the first
 * club's colour so the diagonal still reads as a split, with the crests saying
 * who's who.
 */
function ClubBand({ entities, height }: { entities: BandEntity[]; height: number }) {
  const left = entities[0]?.color ?? terrace.colors.brand;
  const second = entities[1]?.color;
  const right = second && !colorsTooClose(left, second) ? second : darkenHex(left, 0.45);

  return (
    <LinearGradient
      colors={[left, left, right, right]}
      locations={[0, 0.5, 0.5, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        height,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: entities.length > 1 ? 'space-between' : 'center',
        paddingHorizontal: '14%',
      }}
    >
      {entities.map(({ entity, color }) => (
        <Crest
          key={entity.id}
          uri={entity.crest_url}
          name={entity.name}
          size={48}
          plate={CREST_PLATE}
          monogramColor={color}
          monogramSize={15}
        />
      ))}
    </LinearGradient>
  );
}

/** `‹ n / total ›`, matching the web deck's control row. */
function Pager({ index, total }: { index: number; total: number }) {
  return (
    <View className="flex-row items-center justify-center" style={{ gap: 12 }}>
      <PagerButton direction="prev" />
      <Text
        className="text-muted"
        style={{ fontFamily: font.mono, fontSize: 12, minWidth: 48, textAlign: 'center' }}
      >
        {index + 1} / {total}
      </Text>
      <PagerButton direction="next" />
    </View>
  );
}

function PagerButton({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <View
      className="items-center justify-center rounded-full border border-border bg-surface"
      style={{ width: 34, height: 34 }}
    >
      <Svg width={15} height={15} viewBox="0 0 16 16">
        <Path
          d={
            direction === 'prev'
              ? 'M10.5 3 6 8l4.5 5 1-1L8 8l3.5-4-1-1Z'
              : 'M5.5 3 10 8l-4.5 5-1-1L8 8 4.5 4l1-1Z'
          }
          fill={terrace.colors.text}
        />
      </Svg>
    </View>
  );
}
