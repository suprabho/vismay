import { Text, View } from 'react-native';

import { font } from '../fonts';

/** Numbered eyebrow + display headline + supporting line, shared by all slides. */
export function SlideCopy({
  eyebrow,
  heading,
  body,
}: {
  eyebrow: string;
  heading: string;
  body: string;
}) {
  return (
    <View>
      <Text
        className="text-brand mb-2"
        style={{
          fontFamily: font.mono,
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </Text>
      <Text
        className="text-text mb-2"
        style={{
          fontFamily: font.display,
          fontSize: 34,
          lineHeight: 35.7,
          letterSpacing: -0.4,
        }}
      >
        {heading}
      </Text>
      <Text className="text-muted" style={{ fontFamily: font.sans, fontSize: 14, lineHeight: 21 }}>
        {body}
      </Text>
    </View>
  );
}
