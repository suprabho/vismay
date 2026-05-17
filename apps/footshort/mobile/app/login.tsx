import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/AuthProvider';

export default function LoginScreen() {
  const { session, loading, signInWithPassword, signUpWithPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setError(null);
    setBusy(true);
    const fn = mode === 'signin' ? signInWithPassword : signUpWithPassword;
    const { error: err } = await fn(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
    // On success, the root redirects.
  }

  if (!loading && session) return <Redirect href="/" />;

  return (
    <View className="flex-1 bg-bg px-6 justify-center">
      <Text className="text-text text-3xl font-bold mb-2">ShortFoot</Text>
      <Text className="text-muted text-sm mb-8">
        {mode === 'signin' ? 'Sign in to continue.' : 'Create an account to follow teams.'}
      </Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor="#8E8E99"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        className="bg-surface border border-border rounded-lg px-4 py-3 text-text mb-3"
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="#8E8E99"
        secureTextEntry
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        className="bg-surface border border-border rounded-lg px-4 py-3 text-text mb-4"
      />

      {error ? <Text className="text-red-400 text-sm mb-3">{error}</Text> : null}

      <Pressable
        onPress={submit}
        disabled={busy || !email || !password}
        className={`rounded-lg py-3 items-center ${busy || !email || !password ? 'bg-surface' : 'bg-accent'}`}
      >
        {busy ? (
          <ActivityIndicator color="#0B0B0F" />
        ) : (
          <Text className="text-bg font-semibold">
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
        }}
        className="mt-4 self-center"
      >
        <Text className="text-muted text-sm">
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </View>
  );
}
