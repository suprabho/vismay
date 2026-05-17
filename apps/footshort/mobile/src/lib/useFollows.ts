import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from './AuthProvider';
import type { Entity } from './useEntities';

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
    mutationFn: async (entityId: string) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase.from('follows').insert({ user_id: userId, entity_id: entityId });
      if (error && !/duplicate/i.test(error.message)) throw error;
    },
    onSuccess: invalidateFollowDependent,
  });

  const unfollow = useMutation({
    mutationFn: async (entityId: string) => {
      if (!userId) throw new Error('Not signed in');
      const { error } = await supabase.from('follows').delete().eq('entity_id', entityId);
      if (error) throw error;
    },
    onSuccess: invalidateFollowDependent,
  });

  return { follow, unfollow };
}
