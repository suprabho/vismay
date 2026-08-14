import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { font } from './fonts';

/**
 * The `F` monogram from `web/public/brand/mark-f.svg`, inlined so the landing
 * screen doesn't depend on an SVG asset transformer.
 */
export function BrandMark({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={(size * 215.073) / 260.428} height={size} viewBox="0 0 215.073 260.428">
      <Path
        d="M 180.211 38.9 C 175.957 43.647 169.878 46.349 163.505 46.325 L 83.484 46.028 C 67.282 45.968 54.007 58.88 53.619 75.078 L 52.946 103.15 L 137.655 103.15 L 101.195 149.071 L 69.018 149.071 C 60.87 149.071 54.237 155.623 54.137 163.77 L 52.946 260.428 L 0 260.428 L 3.417 65.792 C 4.058 29.271 33.847 0 70.374 0 L 215.073 0 L 180.211 38.9 Z"
        fill={color}
      />
    </Svg>
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

/** Outlined capsule — article source and entity tags. */
export function Pill({
  label,
  muted = false,
  inset = 10,
}: {
  label: string;
  muted?: boolean;
  inset?: number;
}) {
  return (
    <View
      className="rounded-full border border-border"
      style={{ paddingVertical: 3, paddingHorizontal: inset }}
    >
      <Text
        className={muted ? 'text-muted' : 'text-text'}
        style={{ fontFamily: font.sansMedium, fontSize: 11 }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * Monogram crest. The app already falls back to initials on a flat colour when
 * an entity has no badge asset, so the mocks use the same treatment rather than
 * shipping placeholder artwork.
 */
export function CrestMonogram({
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
