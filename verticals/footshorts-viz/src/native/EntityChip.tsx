import { Pressable, Text } from 'react-native';
import { Crest } from './Crest';

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
      <Crest team={name} crestUrl={crestUrl ?? undefined} size={20} style={{ marginRight: 8 }} />
      <Text className={selected ? 'text-accent text-sm font-medium' : 'text-text text-sm'}>
        {name}
      </Text>
    </Pressable>
  );
}
