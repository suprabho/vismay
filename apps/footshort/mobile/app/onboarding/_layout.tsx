import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/AuthProvider';

export default function OnboardingLayout() {
  const { session, profile, loading } = useAuth();
  const { edit } = useGlobalSearchParams<{ edit?: string }>();

  if (loading || (session && !profile)) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (profile?.onboarded_at && !edit) return <Redirect href="/(tabs)/feed" />;

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0B0B0F' } }} />;
}
