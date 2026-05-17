import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

type Props = {
  name: string;
  crestUrl: string | null;
  selected: boolean;
  onPress: () => void;
};

export function EntityChip({ name, crestUrl, selected, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center px-3 py-2 mr-2 mb-2 rounded-full border ${
        selected ? 'bg-accent/20 border-accent' : 'bg-surface border-border'
      }`}
    >
      {crestUrl ? (
        <Image
          source={{ uri: crestUrl }}
          style={{ width: 20, height: 20, marginRight: 8 }}
          contentFit="contain"
        />
      ) : null}
      <Text className={selected ? 'text-accent text-sm font-medium' : 'text-text text-sm'}>
        {name}
      </Text>
    </Pressable>
  );
}
