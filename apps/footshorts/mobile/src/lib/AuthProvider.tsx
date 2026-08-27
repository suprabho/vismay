import { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';

// Closes the auth popup if the app was reopened by the OAuth redirect.
WebBrowser.maybeCompleteAuthSession();

type Profile = {
  id: string;
  display_name: string | null;
  onboarded_at: string | null;
};

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signUpWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signInWithApple: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId: string) {
    // Upsert to ensure a row exists — idempotent.
    await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, onboarded_at')
      .eq('id', userId)
      .single();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    async function handleProfileFailure(e: unknown) {
      console.warn('loadProfile failed, signing out', e);
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.warn('signOut after profile failure also failed', signOutErr);
        setSession(null);
        setProfile(null);
      }
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        if (data.session) loadProfile(data.session.user.id).catch(handleProfileFailure);
      })
      .catch((e) => console.warn('getSession failed', e))
      .finally(() => setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        loadProfile(s.user.id).catch(handleProfileFailure);
      } else {
        setProfile(null);
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signUpWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error: error?.message ?? null };
    },
    signInWithGoogle: async () => {
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return { error: error.message };
      if (!data?.url) return { error: 'Could not start Google sign-in. Please try again.' };

      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      // Cancel / dismiss is not an error — the user just backed out.
      if (res.type !== 'success') return { error: null };

      const url = new URL(res.url);
      const errorDescription = url.searchParams.get('error_description');
      if (errorDescription) return { error: errorDescription };

      const code = url.searchParams.get('code');
      if (!code) return { error: 'Google sign-in did not complete. Please try again.' };

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      return { error: exchangeError?.message ?? null };
    },
    signInWithApple: async () => {
      try {
        // Apple gets the SHA-256 digest of the nonce; the raw nonce goes to
        // Supabase, which hashes it server-side and compares against the
        // identityToken's nonce claim.
        const rawNonce = Crypto.randomUUID();
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          rawNonce,
        );
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        });
        if (!credential.identityToken) {
          return { error: 'Apple sign-in did not complete. Please try again.' };
        }
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
          nonce: rawNonce,
        });
        return { error: error?.message ?? null };
      } catch (e: unknown) {
        // Cancel is not an error — mirrors the Google flow's dismiss handling.
        if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return { error: null };
        return { error: e instanceof Error ? e.message : 'Apple sign-in failed.' };
      }
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
    deleteAccount: async () => {
      const { error } = await supabase.rpc('delete_account');
      if (error) return { error: error.message };
      // Server-side sessions are cascade-deleted with the user; a global
      // signOut would 403 against a nonexistent user, so only clear local state.
      await supabase.auth.signOut({ scope: 'local' });
      return { error: null };
    },
    refreshProfile: async () => {
      if (session) await loadProfile(session.user.id);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
