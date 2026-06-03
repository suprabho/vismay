import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  User,
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';

const BACKEND_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  firebaseUser: User;
  idToken:      string;
  role:         'viewer' | 'editor' | 'admin';
  mongoId:      string;
  displayName:  string;
  email:        string;
  photoURL:     string | null;
}

interface AuthContextValue {
  user:            AuthUser | null;
  loading:         boolean;
  authError:       string | null;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail:  (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword:   (email: string) => Promise<void>;
  logout:          () => Promise<void>;
  getIdToken:      () => Promise<string | null>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<AuthUser | null>(null);
  const [loading, setLoading]     = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        const idToken = await firebaseUser.getIdToken();

        // Sync with backend — provisions the MongoDB user on first login,
        // returns role on subsequent visits.
        const res = await fetch(`${BACKEND_URL}/api/auth/sync`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });

        if (!res.ok) throw new Error(`Sync failed: ${res.status}`);

        const data = await res.json();

        setUser({
          firebaseUser,
          idToken,
          role:        data.role,
          mongoId:     data.id,
          displayName: data.displayName ?? firebaseUser.displayName ?? '',
          email:       data.email       ?? firebaseUser.email       ?? '',
          photoURL:    data.photoURL    ?? firebaseUser.photoURL,
        });
      } catch (err) {
        console.error('[AuthContext] sync error:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return unsub;
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName: string) => {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-up failed';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    setAuthError(null);
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Password reset failed';
      setAuthError(msg);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUser(null);
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, authError, loginWithGoogle, loginWithEmail, signUpWithEmail, resetPassword, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
