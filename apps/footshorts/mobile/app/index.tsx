import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/AuthProvider';

export default function Index() {
  const { session, profile, loading } = useAuth();

  if (loading || (session && !profile)) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  if (!session) return <Redirect href="/login" />;
  if (!profile?.onboarded_at) return <Redirect href="/onboarding/leagues" />;
  return <Redirect href="/(tabs)/feed" />;
}
