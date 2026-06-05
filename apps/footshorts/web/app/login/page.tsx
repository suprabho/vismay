'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, type CSSProperties } from 'react';
import { AuthWidget, createSupabaseAuthClient } from '@vismay/ui';
import { useAuth } from '@/lib/AuthProvider';
import { supabase } from '@/lib/supabase';

// Map footshorts' brand tokens (--sf-color-* are RGB channel triples) onto the
// widget's --auth-* variables, so the shared widget renders in Footshorts' brand.
const BRAND_STYLE = {
  '--auth-bg': 'transparent',
  '--auth-surface': 'rgb(var(--sf-color-surface))',
  '--auth-fg': 'rgb(var(--sf-color-text))',
  '--auth-muted': 'rgb(var(--sf-color-muted))',
  '--auth-border': 'rgb(var(--sf-color-border))',
  '--auth-accent': 'rgb(var(--sf-color-accent))',
  '--auth-accent-fg': 'rgb(var(--sf-color-accentText))',
} as CSSProperties;

export default function LoginPage() {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) router.replace('/');
  }, [loading, session, router]);

  const authClient = useMemo(() => createSupabaseAuthClient(supabase), []);

  return (
    <main className="flex min-h-screen flex-col justify-center bg-bg px-6">
      <div className="mx-auto w-full max-w-sm">
        <AuthWidget
          authClient={authClient}
          providers={['password', 'google', 'magic']}
          allowSignup
          brand={{ name: 'Footshorts' }}
          copy={{ signupSubtitle: 'Create an account to follow teams.' }}
          onAuthed={() => router.replace('/')}
          style={BRAND_STYLE}
        />
      </div>
    </main>
  );
}
