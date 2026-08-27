'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FollowSource } from '@footshorts/shared/analytics';
import { supabase } from './supabase';
import { trackEntityFollowed, trackEntityUnfollowed } from './analytics';
import { useAuth } from './AuthProvider';
import type { Entity } from './useEntities';

/** Plain entity id, or an id plus where the toggle happened (for analytics). */
type FollowInput = string | { entityId: string; source?: FollowSource };

const followInput = (input: FollowInput) =>
  typeof input === 'string' ? { entityId: input, source: undefined } : input;

type Follow = {
  entity_id: string;
  created_at: string;
  entity: Entity;
};

export function useFollows() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  return useQuery({
    queryKey: ['follows', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Follow[]> => {
      const { data, error } = await supabase
        .from('follows')
        .select('entity_id, created_at, entity:entities(id, type, slug, name, country, league_slug, crest_url)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Follow[]) ?? [];
    },
  });
}

export function useFollowSet() {
  const follows = useFollows();
  return new Set(follows.data?.map((f) => f.entity_id) ?? []);
}

export function useFollowMutation() {
  const qc = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const invalidateFollowDependent = () => {
    qc.invalidateQueries({ queryKey: ['follows', userId] });
    qc.invalidateQueries({ queryKey: ['followedFixtures', userId] });
    qc.invalidateQueries({ queryKey: ['followedStories', userId] });
  };

  const follow = useMutation({
    mutationFn: async (input: FollowInput) => {
      if (!userId) throw new Error('Not signed in');
      const { entityId } = followInput(input);
      const { error } = await supabase.from('follows').insert({ user_id: userId, entity_id: entityId });
      if (error && !/duplicate/i.test(error.message)) throw error;
    },
    onSuccess: (_data, input) => {
      const { entityId, source } = followInput(input);
      trackEntityFollowed(entityId, source);
      invalidateFollowDependent();
    },
  });

  const unfollow = useMutation({
    mutationFn: async (input: FollowInput) => {
      if (!userId) throw new Error('Not signed in');
      const { entityId } = followInput(input);
      const { error } = await supabase.from('follows').delete().eq('entity_id', entityId);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      const { entityId, source } = followInput(input);
      trackEntityUnfollowed(entityId, source);
      invalidateFollowDependent();
    },
  });

  return { follow, unfollow };
}
