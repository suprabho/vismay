'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { EntityChip } from '@vismay/footshort-viz/web';
import { useAuth } from '@/lib/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useTeams } from '@/lib/useEntities';
import { useFollowMutation, useFollows } from '@/lib/useFollows';

const MIN_TEAMS = 3;

function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

function OnboardingTeamsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, refreshProfile } = useAuth();
  const leaguesParam = params.get('leagues');
  const edit = params.get('edit');
  const leagueSlugs = useMemo(
    () => (leaguesParam ? leaguesParam.split(',').filter(Boolean) : []),
    [leaguesParam]
  );

  const { data: teams, isLoading } = useTeams(leagueSlugs);
  const { data: follows } = useFollows();
  const { follow, unfollow } = useFollowMutation();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (seeded || !teams) return;
    if (edit && !follows) return;
    if (edit && follows) {
      const followed = new Set(follows.map((f) => f.entity_id));
      const seed = new Set(teams.filter((t) => followed.has(t.id)).map((t) => t.id));
      setPicked(seed);
      setInitial(seed);
    }
    setSeeded(true);
  }, [teams, follows, edit, seeded]);

  const filtered = useMemo(() => {
    const list = teams ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, query]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function finish() {
    if (!session) return;
    setBusy(true);
    const toFollow = Array.from(picked).filter((id) => !initial.has(id));
    const toUnfollow = Array.from(initial).filter((id) => !picked.has(id));
    await Promise.all([
      ...toFollow.map((id) => follow.mutateAsync(id)),
      ...toUnfollow.map((id) => unfollow.mutateAsync(id)),
    ]);
    if (!edit) {
      await supabase
        .from('profiles')
        .update({ onboarded_at: new Date().toISOString() })
        .eq('id', session.user.id);
      await refreshProfile();
    }
    setBusy(false);
    router.replace(edit ? '/following' : '/feed');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const canFinish = picked.size >= MIN_TEAMS;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="px-6 pt-8">
        <h1 className="mb-1 text-3xl font-bold text-text">Pick your teams</h1>
        <p className="mb-4 text-sm text-muted">
          Choose at least {MIN_TEAMS}. ({picked.size} selected)
        </p>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search teams"
          className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex flex-wrap">
          {filtered.map((t) => (
            <EntityChip
              key={t.id}
              name={t.name}
              crestUrl={t.crest_url}
              selected={picked.has(t.id)}
              onClick={() => toggle(t.id)}
            />
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="mt-6 text-center text-sm text-muted">No teams match your search.</p>
        ) : null}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-bg px-6 py-4">
        <button
          type="button"
          onClick={finish}
          disabled={!canFinish || busy}
          className={`w-full rounded-lg py-3 font-semibold ${
            canFinish && !busy ? 'bg-accent text-bg' : 'bg-surface text-muted'
          }`}
        >
          {busy ? '…' : 'Finish'}
        </button>
      </div>
    </div>
  );
}

export default function OnboardingTeams() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <OnboardingTeamsInner />
    </Suspense>
  );
}
