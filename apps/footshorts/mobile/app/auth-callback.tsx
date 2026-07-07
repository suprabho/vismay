import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/lib/AuthProvider';
import { supabase } from '@/lib/supabase';

/**
 * Landing screen for footshorts://auth-callback deep links. iOS resolves the
 * OAuth redirect inside openAuthSessionAsync, but Android can also route it
 * here as a link — exchange the code only if no session exists yet. A failed
 * second exchange after the primary already succeeded is expected; never sign
 * out on failure.
 */
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (code && !session) {
      supabase.auth.exchangeCodeForSession(code).catch(() => {
        // Swallow — the primary exchange likely already consumed the code.
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <View className="flex-1 bg-bg items-center justify-center">
        <ActivityIndicator color="#00D26A" />
      </View>
    );
  }

  return <Redirect href="/" />;
}
