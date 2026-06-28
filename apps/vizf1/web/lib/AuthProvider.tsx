'use client'

import { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabaseAuth } from './supabaseAuth'

type Profile = {
  id: string
  display_name: string | null
  onboarded_at: string | null
}

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = supabaseAuth()

  async function loadProfile(userId: string) {
    await supabase.from('vizf1_profiles').upsert({ id: userId }, { onConflict: 'id' })
    const { data } = await supabase
      .from('vizf1_profiles')
      .select('id, display_name, onboarded_at')
      .eq('id', userId)
      .single()
    setProfile((data as Profile) ?? null)
  }

  useEffect(() => {
    async function handleProfileFailure(e: unknown) {
      console.warn('loadProfile failed, signing out', e)
      try {
        await supabase.auth.signOut()
      } catch (signOutErr) {
        console.warn('signOut after profile failure also failed', signOutErr)
        setSession(null)
        setProfile(null)
      }
    }

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session)
        if (data.session) loadProfile(data.session.user.id).catch(handleProfileFailure)
      })
      .catch((e) => console.warn('getSession failed', e))
      .finally(() => setLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s) {
        loadProfile(s.user.id).catch(handleProfileFailure)
      } else {
        setProfile(null)
      }
    })

    return () => {
      sub.subscription.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value: AuthContextValue = {
    session,
    profile,
    loading,
    signOut: async () => {
      await supabase.auth.signOut()
    },
    refreshProfile: async () => {
      if (session) await loadProfile(session.user.id)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
