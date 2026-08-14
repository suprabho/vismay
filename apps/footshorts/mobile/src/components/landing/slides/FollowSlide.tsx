import { Text, View } from 'react-native';
import { terrace } from '@footshorts/brand';

import { font } from '../fonts';
import { Card, CheckIcon, CrestMonogram } from '../ui';
import { SlideCopy } from './SlideCopy';

const LIVERPOOL = '#C8102E';
const SALAH = '#241F20';
const PREMIER_LEAGUE = '#37003C';
const LA_LIGA = '#0E1E5B';
const RING_IDLE = '#D8D2C6';
const MONOGRAM_WASH = 'rgba(27, 26, 23, 0.06)';

const RING_OUTER = 56;
const RING_BORDER = 2;
const RING_GAP = 2;
const RING_INNER = RING_OUTER - (RING_BORDER + RING_GAP) * 2;

/**
 * Slide 02 — mocked `StoryRings` over the onboarding league picker, showing
 * that the feed is assembled from what you choose to follow.
 */
export function FollowSlide() {
  return (
    <>
      <Card>
        <View
          className="flex-row border-b border-border"
          style={{ gap: 14, paddingVertical: 14, paddingHorizontal: 16 }}
        >
          <StoryRing label="Liverpool" monogram="LIV" background={LIVERPOOL} />
          <StoryRing label="Salah" monogram="SAL" background={SALAH} />
          <StoryRing
            label="Premier L…"
            monogram="PL"
            background={PREMIER_LEAGUE}
            monogramSize={11}
            seen
          />
        </View>

        <View className="flex-row" style={{ gap: 12, padding: 16 }}>
          <EntityCard monogram="PL" monogramColor={PREMIER_LEAGUE} name="Premier League" selected />
          <EntityCard monogram="LL" monogramColor={LA_LIGA} name="La Liga" />
        </View>
      </Card>

      <SlideCopy
        eyebrow="02 · Your side"
        heading="Follow the clubs, not the noise."
        body="Pick leagues, teams and players. Your feed is only them — scores, standings, kickoffs."
      />
    </>
  );
}

/** Brand-coloured ring when there's something unread, stone when already seen. */
function StoryRing({
  label,
  monogram,
  background,
  monogramSize = 12,
  seen = false,
}: {
  label: string;
  monogram: string;
  background: string;
  monogramSize?: number;
  seen?: boolean;
}) {
  return (
    <View className="items-center" style={{ width: 60, gap: 4, opacity: seen ? 0.6 : 1 }}>
      <View
        style={{
          width: RING_OUTER,
          height: RING_OUTER,
          borderRadius: RING_OUTER / 2,
          padding: RING_BORDER,
          backgroundColor: seen ? RING_IDLE : terrace.colors.brand,
        }}
      >
        <View className="flex-1 rounded-full bg-surface" style={{ padding: RING_GAP }}>
          <CrestMonogram
            label={monogram}
            background={background}
            size={RING_INNER}
            fontSize={monogramSize}
          />
        </View>
      </View>
      <Text
        className="text-muted"
        numberOfLines={1}
        style={{ fontFamily: font.sans, fontSize: 11 }}
      >
        {label}
      </Text>
    </View>
  );
}

function EntityCard({
  monogram,
  monogramColor,
  name,
  selected = false,
}: {
  monogram: string;
  monogramColor: string;
  name: string;
  selected?: boolean;
}) {
  return (
    <View
      className={`flex-1 items-center rounded-2xl border p-4 ${
        selected ? 'border-brand bg-brand/10' : 'border-border bg-surface'
      }`}
      style={{ gap: 12 }}
    >
      {selected ? (
        <View
          className="absolute items-center justify-center rounded-full bg-brand"
          style={{ right: 8, top: 8, width: 20, height: 20 }}
        >
          <CheckIcon size={12} stroke={terrace.colors.brandText} />
        </View>
      ) : null}

      <CrestMonogram
        label={monogram}
        background={MONOGRAM_WASH}
        size={56}
        fontSize={18}
        color={monogramColor}
      />
      <Text
        className={selected ? 'text-brand' : 'text-text'}
        style={{
          fontFamily: selected ? font.sansSemiBold : font.sansMedium,
          fontSize: 14,
          lineHeight: 16.1,
          textAlign: 'center',
        }}
      >
        {name}
      </Text>
    </View>
  );
}
