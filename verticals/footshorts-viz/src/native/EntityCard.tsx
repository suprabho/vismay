import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Props = {
  name: string;
  crestUrl: string | null;
  country?: string | null;
  selected: boolean;
  onPress: () => void;
};

// Onboarding grid card — native port of web/EntityCard.tsx. Shows a crest (or
// a plain initial — web parity, NOT the monogram Crest badge), the entity name,
// optional country, and a checkmark when selected.
export function EntityCard({ name, crestUrl, country, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`relative items-center rounded-2xl border p-4 ${
        selected ? 'border-accent bg-accent/10' : 'border-border bg-surface'
      }`}
      style={{ width: '100%', rowGap: 12 }}
    >
      {selected ? (
        <View
          className="absolute items-center justify-center rounded-full bg-accent"
          style={{ right: 8, top: 8, width: 20, height: 20 }}
        >
          <Svg width={12} height={12} viewBox="0 0 16 16">
            <Path
              d="M3.5 8.5l3 3 6-7"
              stroke="#0B0B0F"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </View>
      ) : null}
      <View
        className="items-center justify-center overflow-hidden rounded-full bg-white/10"
        style={{ width: 56, height: 56 }}
      >
        {crestUrl ? (
          <Image source={{ uri: crestUrl }} style={{ width: 40, height: 40 }} contentFit="contain" />
        ) : (
          <Text className="text-lg font-bold text-muted">{name.charAt(0)}</Text>
        )}
      </View>
      <Text
        className={`text-center text-sm leading-tight ${
          selected ? 'font-semibold text-accent' : 'font-medium text-text'
        }`}
        numberOfLines={2}
      >
        {name}
      </Text>
      {country ? (
        <Text className="text-xs text-muted" style={{ marginTop: -4 }}>
          {country}
        </Text>
      ) : null}
    </Pressable>
  );
}
