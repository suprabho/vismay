import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@shortfoot/brand/native';
import type { ThemeName } from '@shortfoot/brand';
import { useAuth } from '@/lib/AuthProvider';
import { useFollows } from '@/lib/useFollows';

const THEME_OPTIONS: { name: ThemeName; label: string }[] = [
  { name: 'classic', label: 'Classic' },
  { name: 'pitch', label: 'Pitch' },
  { name: 'terrace', label: 'Terrace' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const { data: follows } = useFollows();
  const { themeName, setTheme } = useTheme();
  const email = session?.user?.email;

  return (
    <View className="flex-1 bg-bg px-6" style={{ paddingTop: insets.top + 24 }}>
      <Pressable onPress={() => router.back()} hitSlop={8} className="mb-4">
        <Text className="text-text text-base">←</Text>
      </Pressable>
      <Text className="text-text text-2xl font-bold mb-1">Profile</Text>
      <Text className="text-muted text-sm mb-8">{email ?? 'Not signed in'}</Text>

      <Pressable
        onPress={() => router.push('/following')}
        className="flex-row items-center justify-between bg-surface border border-border rounded-lg px-4 py-3 mb-3"
      >
        <Text className="text-text font-medium">Following</Text>
        <Text className="text-muted text-sm">
          {follows?.length ?? 0} →
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/admin')}
        className="flex-row items-center justify-between bg-surface border border-border rounded-lg px-4 py-3 mb-3"
      >
        <Text className="text-text font-medium">Pipeline stats</Text>
        <Text className="text-muted text-sm">→</Text>
      </Pressable>

      <View className="bg-surface border border-border rounded-lg px-4 py-3 mb-3">
        <Text className="text-text text-sm font-medium mb-2">Theme</Text>
        <View className="flex-row gap-2">
          {THEME_OPTIONS.map((opt) => {
            const active = opt.name === themeName;
            return (
              <Pressable
                key={opt.name}
                onPress={() => setTheme(opt.name)}
                className={
                  active
                    ? 'flex-1 items-center rounded-md border border-accent bg-accent py-2'
                    : 'flex-1 items-center rounded-md border border-border bg-bg py-2'
                }
              >
                <Text
                  className={
                    active
                      ? 'text-accent-text text-sm font-medium'
                      : 'text-text text-sm font-medium'
                  }
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Pressable
        onPress={signOut}
        className="bg-surface border border-border rounded-lg py-3 items-center mt-4"
      >
        <Text className="text-text font-medium">Sign out</Text>
      </Pressable>
    </View>
  );
}
