'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthProvider';

export default function LoginPage() {
  const { session, loading, signInWithPassword, signUpWithPassword } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && session) router.replace('/');
  }, [loading, session, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const fn = mode === 'signin' ? signInWithPassword : signUpWithPassword;
    const { error: err } = await fn(email.trim(), password);
    setBusy(false);
    if (err) setError(err);
  }

  const disabled = busy || !email || !password;

  return (
    <main className="flex min-h-screen flex-col justify-center bg-bg px-6">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="mb-2 text-3xl font-bold text-text">ShortFoot</h1>
        <p className="mb-8 text-sm text-muted">
          {mode === 'signin' ? 'Sign in to continue.' : 'Create an account to follow teams.'}
        </p>

        <form onSubmit={submit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            className="mb-3 w-full rounded-lg border border-border bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />

          {error ? <p className="mb-3 text-sm text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={disabled}
            className={`w-full rounded-lg py-3 font-semibold ${
              disabled ? 'bg-surface text-muted' : 'bg-accent text-bg'
            }`}
          >
            {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError(null);
          }}
          className="mt-4 block w-full text-center text-sm text-muted hover:text-text"
        >
          {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </main>
  );
}
