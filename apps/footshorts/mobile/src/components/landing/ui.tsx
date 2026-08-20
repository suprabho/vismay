import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';

import { font } from './fonts';
import { initials } from './entity';

/**
 * The app icon, as shipped to the stores (`assets/icon.png` — the same file
 * `app.config.ts` points `icon` at), clipped to a rounded square.
 *
 * The store asset is opaque RGB: the artwork is a squircle and everything
 * outside it is near-black, so it can't be drawn flat on the cream landing
 * without four dark corners. The clip radius below is measured, not guessed —
 * the artwork's straight top edge begins 27.7% of the way across, so a
 * circular corner has to be at least that round to stay inside the squircle
 * everywhere. 29% clears it with margin; the slight overscale keeps the
 * downscale filter from smearing a corner pixel back into view.
 */
const ICON_CLIP = 0.29;
const ICON_OVERSCAN = 1.06;

export function AppIcon({ size = 22 }: { size?: number }) {
  const inner = size * ICON_OVERSCAN;
  const offset = -(inner - size) / 2;

  return (
    <View
      style={{ width: size, height: size, borderRadius: size * ICON_CLIP, overflow: 'hidden' }}
    >
      <Image
        source={require('../../../assets/icon.png')}
        style={{ width: inner, height: inner, marginLeft: offset, marginTop: offset }}
        contentFit="cover"
      />
    </View>
  );
}

export function CheckIcon({
  size = 12,
  stroke,
  strokeWidth = 2.5,
}: {
  size?: number;
  stroke: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        d="M3.5 8.5l3 3 6-7"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/**
 * The surface every mocked app screen sits on. Split in two because iOS clips a
 * layer's shadow when `overflow: hidden` is set on the same view: the outer view
 * carries the shadow, the inner one does the clipping.
 */
export function Card({ children }: { children: ReactNode }) {
  return (
    <View
      className="rounded-xl bg-surface"
      style={{
        // Web: 0 12px 32px -18px rgba(27,26,23,.25)
        shadowColor: '#1B1A17',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 3,
      }}
    >
      <View className="rounded-xl border border-border bg-surface overflow-hidden">{children}</View>
    </View>
  );
}

/**
 * Monogram crest — the fallback inside `Crest`. The app already falls back to
 * initials on a flat colour when an entity has no badge asset, so the mocks use
 * the same treatment rather than shipping placeholder artwork.
 */
function CrestMonogram({
  label,
  background,
  size,
  fontSize = 16,
  color = '#FFFFFF',
}: {
  label: string;
  background: string;
  size: number;
  fontSize?: number;
  color?: string;
}) {
  return (
    <View
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background,
      }}
    >
      <Text style={{ fontFamily: font.sansBold, fontSize, color }}>{label}</Text>
    </View>
  );
}

/**
 * A real club or competition badge, on an optional circular plate.
 *
 * Crests come from the entity rows as remote URLs, so two things can go wrong
 * on a landing screen that may be the first thing a cold install renders: the
 * entity has no asset at all, or the fetch fails. Both land on the monogram
 * treatment the feed already uses, which is why this never renders an empty
 * hole while loading.
 */
export function Crest({
  uri,
  name,
  size,
  plate,
  monogramColor,
  monogramSize,
  /** Badge area as a fraction of the plate — crests need breathing room. */
  inset = 0.68,
}: {
  uri: string | null;
  name: string;
  size: number;
  plate?: string;
  monogramColor: string;
  monogramSize?: number;
  inset?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <CrestMonogram
        label={initials(name)}
        background={plate ?? 'transparent'}
        size={size}
        fontSize={monogramSize ?? size * 0.3}
        color={monogramColor}
      />
    );
  }

  return (
    <View
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: plate ?? 'transparent',
      }}
    >
      <Image
        source={{ uri }}
        style={{ width: size * inset, height: size * inset }}
        contentFit="contain"
        transition={180}
        onError={() => setFailed(true)}
      />
    </View>
  );
}
