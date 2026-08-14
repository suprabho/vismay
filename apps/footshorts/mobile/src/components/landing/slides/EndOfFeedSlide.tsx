import { Text, View } from 'react-native';
import { terrace } from '@footshorts/brand';

import { font } from '../fonts';
import { Card, CheckIcon } from '../ui';
import { SlideCopy } from './SlideCopy';

/**
 * Slide 03 — the end-of-feed state, which is the actual product promise: the
 * day's briefs run out and you put the phone down.
 */
export function EndOfFeedSlide() {
  return (
    <>
      <Card>
        <View
          className="flex-row items-baseline justify-between"
          style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 10 }}
        >
          <Text
            className="text-muted"
            style={{
              fontFamily: font.mono,
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
            }}
          >
            Today
          </Text>
          <Text className="text-text" style={{ fontFamily: font.mono, fontSize: 11 }}>
            9 briefs · 4 min
          </Text>
        </View>

        <View>
          <BriefRow title="Arsenal hold on at the Emirates" read />
          <BriefRow title="Xabi Alonso's press, in three phases" read />
          <BriefRow title="Slot's midfield gamble pays off" />
        </View>

        <View
          className="items-center border-t border-border"
          style={{ paddingVertical: 20, paddingHorizontal: 16 }}
        >
          <Text
            className="text-text mb-1"
            style={{ fontFamily: font.display, fontSize: 19 }}
          >
            You're all caught up.
          </Text>
          <Text className="text-muted" style={{ fontFamily: font.sans, fontSize: 12 }}>
            Next drop tomorrow, 7:00am
          </Text>
        </View>
      </Card>

      <SlideCopy
        eyebrow="03 · The end"
        heading="A feed that actually ends."
        body="No infinite scroll, no clickbait, no rage bait. Finish the day's football and put the phone down."
      />
    </>
  );
}

function BriefRow({ title, read = false }: { title: string; read?: boolean }) {
  return (
    <View
      className="flex-row items-center border-t border-border"
      style={{ gap: 10, paddingVertical: 11, paddingHorizontal: 16, opacity: read ? 0.45 : 1 }}
    >
      {read ? (
        <CheckIcon size={14} stroke={terrace.colors.text} strokeWidth={2} />
      ) : (
        <View
          className="rounded-full bg-brand"
          style={{ width: 6, height: 6, marginHorizontal: 4 }}
        />
      )}
      <Text
        className="text-text flex-1"
        numberOfLines={1}
        style={{ fontFamily: read ? font.sans : font.sansMedium, fontSize: 13 }}
      >
        {title}
      </Text>
    </View>
  );
}
