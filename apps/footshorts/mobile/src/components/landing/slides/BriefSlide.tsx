import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { font } from '../fonts';
import { Card, CrestMonogram, Pill } from '../ui';
import { SlideCopy } from './SlideCopy';

const LIVERPOOL = '#C8102E';
const TOTTENHAM = '#132257';
const CREST_PLATE = 'rgba(255, 255, 255, 0.88)';
const BAND_HEIGHT = 124;

/**
 * Slide 01 — a mocked `FeedCard`: the 60-word brief the whole product is built
 * around. Copy is representative, not live data; the landing screen renders
 * logged out, so it can't call the feed.
 */
export function BriefSlide() {
  return (
    <>
      <Card>
        <ClubBand />
        <View style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 }}>
          <View className="flex-row items-center mb-2.5" style={{ gap: 8 }}>
            <Pill label="The Athletic" />
            <Text className="text-muted" style={{ fontFamily: font.sans, fontSize: 11 }}>
              2h ago
            </Text>
          </View>

          <Text
            className="text-text mb-2"
            style={{ fontFamily: font.sansBold, fontSize: 16, lineHeight: 19.2 }}
          >
            Slot's midfield gamble finally pays at Anfield
          </Text>

          <Text
            className="text-text"
            style={{ fontFamily: font.sans, fontSize: 13, lineHeight: 19 }}
          >
            Liverpool pressed a back three into a diamond and Tottenham never solved it. Two goals
            inside eleven minutes, both from turnovers in the middle third. Spurs' 63%
            possession bought them one shot on target.
          </Text>

          <View className="flex-row flex-wrap mt-3" style={{ gap: 6 }}>
            <Pill label="Liverpool" inset={9} />
            <Pill label="Tottenham" inset={9} />
            <Pill label="+2 more" inset={9} muted />
          </View>

          <Text
            className="text-brand mt-3.5"
            style={{ fontFamily: font.sansMedium, fontSize: 13 }}
          >
            Read at source →
          </Text>
        </View>
      </Card>

      <SlideCopy
        eyebrow="01 · The brief"
        heading="Sixty words. Then you know."
        body="Every story summarised to what happened and why it matters. Swipe for the next one."
      />
    </>
  );
}

/**
 * The two-club colour band. CSS `linear-gradient(135deg, …)` is a true 45°
 * diagonal in pixels whatever the box shape, so the normalised start/end points
 * are derived from the measured aspect ratio rather than pinned to the corners.
 */
function ClubBand() {
  const [ratio, setRatio] = useState(BAND_HEIGHT / 342);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0) setRatio(height / width);
  };

  const halfSpan = ratio / 2;

  return (
    <LinearGradient
      onLayout={onLayout}
      colors={[LIVERPOOL, LIVERPOOL, TOTTENHAM, TOTTENHAM]}
      locations={[0, 0.5, 0.5, 1]}
      start={{ x: 0.5 - halfSpan, y: 0 }}
      end={{ x: 0.5 + halfSpan, y: 1 }}
      style={{
        height: BAND_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: '12%',
      }}
    >
      <CrestMonogram label="LIV" size={46} background={CREST_PLATE} color={LIVERPOOL} />
      <CrestMonogram label="TOT" size={52} background={CREST_PLATE} color={TOTTENHAM} />
    </LinearGradient>
  );
}
