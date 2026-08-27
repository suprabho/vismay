'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabaseAuth } from './supabaseAuth'
import { useAuth } from './AuthProvider'

export type FollowEntityType = 'driver' | 'constructor'

export type Follow = {
  entity_type: FollowEntityType
  entity_id: string
  created_at: string
}

export type FollowRef = { type: FollowEntityType; id: string }

const followKey = (f: FollowRef) => `${f.type}:${f.id}`

/** The user's followed drivers + constructors. Empty (not stale) when logged out. */
export function useFollows() {
  const { session } = useAuth()
  const userId = session?.user.id ?? null

  return useQuery({
    queryKey: ['vizf1', 'follows', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Follow[]> => {
      const sb = supabaseAuth()
      const { data, error } = await sb
        .from('vizf1_follows')
        .select('entity_type, entity_id, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as Follow[]) ?? []
    },
  })
}

/** Set of `${type}:${id}` keys for quick membership checks. */
export function useFollowSet() {
  const follows = useFollows()
  return new Set((follows.data ?? []).map((f) => followKey({ type: f.entity_type, id: f.entity_id })))
}

export function useFollowMutation() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const userId = session?.user.id ?? null

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['vizf1', 'follows', userId] })
    // The "For You" rail derives its rings from these follows.
    qc.invalidateQueries({ queryKey: ['vizf1', 'followed'] })
  }

  const follow = useMutation({
    mutationFn: async (ref: FollowRef) => {
      if (!userId) throw new Error('Not signed in')
      const sb = supabaseAuth()
      const { error } = await sb
        .from('vizf1_follows')
        .insert({ user_id: userId, entity_type: ref.type, entity_id: ref.id })
      if (error && !/duplicate/i.test(error.message)) throw error
    },
    onSuccess: invalidate,
  })

  const unfollow = useMutation({
    mutationFn: async (ref: FollowRef) => {
      if (!userId) throw new Error('Not signed in')
      const sb = supabaseAuth()
      const { error } = await sb
        .from('vizf1_follows')
        .delete()
        .eq('entity_type', ref.type)
        .eq('entity_id', ref.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { follow, unfollow }
}
