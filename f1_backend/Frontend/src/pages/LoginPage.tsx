import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'signin' | 'signup' | 'reset';

export function LoginPage() {
  const { loginWithGoogle, loginWithEmail, signUpWithEmail, resetPassword, authError } = useAuth();

  const [mode, setMode]               = useState<Mode>('signin');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [resetSent, setResetSent]     = useState(false);

  const handleGoogle = async () => {
    setSubmitting(true);
    try { await loginWithGoogle(); } finally { setSubmitting(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'signin') {
        await loginWithEmail(email, password);
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName);
      } else {
        await resetPassword(email);
        setResetSent(true);
      }
    } catch {
      // authError is set in context
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setResetSent(false);
    setEmail('');
    setPassword('');
    setDisplayName('');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-950 px-4"
         style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #1a1a2e 0%, #0a0a0a 60%)' }}>

      {/* Logo */}
      <div className="mb-10 text-center">
        <h1 className="font-serif italic font-black text-5xl tracking-tighter text-white">APEX</h1>
        <p className="mt-1 text-neutral-500 text-xs font-mono uppercase tracking-widest">Formula 1 Analytics</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">

        {/* Mode tabs — not shown in reset flow */}
        {mode !== 'reset' && (
          <div className="flex mb-8 bg-neutral-800 rounded-lg p-1">
            <button
              onClick={() => switchMode('signin')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'signin'
                  ? 'bg-white text-neutral-900'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => switchMode('signup')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
                mode === 'signup'
                  ? 'bg-white text-neutral-900'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>
        )}

        {/* Reset mode header */}
        {mode === 'reset' && (
          <div className="mb-6">
            <button
              onClick={() => switchMode('signin')}
              className="text-neutral-500 hover:text-white text-sm flex items-center gap-1 mb-4 transition-colors"
            >
              ← Back to sign in
            </button>
            <h2 className="text-white font-semibold">Reset password</h2>
            <p className="text-neutral-400 text-sm mt-1">Enter your email and we'll send a reset link.</p>
          </div>
        )}

        {/* Google button — not shown in reset flow */}
        {mode !== 'reset' && (
          <>
            <button
              onClick={handleGoogle}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-white text-neutral-900 rounded-lg font-medium text-sm hover:bg-neutral-100 transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-neutral-800" />
              <span className="text-neutral-600 text-xs font-mono">or</span>
              <div className="flex-1 h-px bg-neutral-800" />
            </div>
          </>
        )}

        {/* Reset sent confirmation */}
        {resetSent ? (
          <div className="text-center py-4">
            <div className="text-green-400 text-sm font-medium mb-1">Reset email sent</div>
            <p className="text-neutral-400 text-xs">Check your inbox for a password reset link.</p>
            <button
              onClick={() => switchMode('signin')}
              className="mt-4 text-neutral-400 hover:text-white text-sm transition-colors"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Display name — sign up only */}
            {mode === 'signup' && (
              <div>
                <label className="block text-xs text-neutral-400 mb-1.5 font-mono uppercase tracking-wider">
                  Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  required
                  placeholder="Your name"
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-neutral-400 mb-1.5 font-mono uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
              />
            </div>

            {/* Password — not shown in reset flow */}
            {mode !== 'reset' && (
              <div>
                <label className="block text-xs text-neutral-400 mb-1.5 font-mono uppercase tracking-wider">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  minLength={6}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
                />
              </div>
            )}

            {/* Forgot password — sign in only */}
            {mode === 'signin' && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => switchMode('reset')}
                  className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Error */}
            {authError && (
              <div className="bg-red-950 border border-red-900 rounded-lg px-3 py-2.5">
                <p className="text-red-400 text-xs leading-relaxed">{authError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-white text-neutral-900 rounded-lg font-semibold text-sm hover:bg-neutral-100 transition-colors disabled:opacity-50 mt-1"
            >
              {submitting
                ? 'Please wait…'
                : mode === 'signin'
                ? 'Sign In'
                : mode === 'signup'
                ? 'Create Account'
                : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>

      {/* Admin note */}
      <p className="mt-6 text-neutral-700 text-xs font-mono text-center max-w-xs">
        Admin access is granted via MongoDB Atlas.<br />Contact the team to request elevated permissions.
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
