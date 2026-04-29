'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { EntityChip } from '@/components/EntityChip';
import { useAuth } from '@/lib/AuthProvider';
import { supabase } from '@/lib/supabase';
import { useTeams, type Entity } from '@/lib/useEntities';
import { useFollowMutation } from '@/lib/useFollows';

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
  const leagueSlugs = useMemo(
    () => (leaguesParam ? leaguesParam.split(',').filter(Boolean) : []),
    [leaguesParam]
  );

  const { data: teams, isLoading } = useTeams(leagueSlugs);
  const { follow } = useFollowMutation();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, Entity[]>();
    for (const t of teams ?? []) {
      const key = t.league_slug ?? 'other';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [teams]);

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
    await Promise.all(Array.from(picked).map((id) => follow.mutateAsync(id)));
    await supabase
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', session.user.id);
    await refreshProfile();
    setBusy(false);
    router.replace('/feed');
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
        <p className="mb-6 text-sm text-muted">
          Choose at least {MIN_TEAMS}. ({picked.size} selected)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {grouped.map(([leagueSlug, list]) => (
          <div key={leagueSlug} className="mb-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">{leagueSlug}</p>
            <div className="flex flex-wrap">
              {list.map((t) => (
                <EntityChip
                  key={t.id}
                  name={t.name}
                  crestUrl={t.crest_url}
                  selected={picked.has(t.id)}
                  onClick={() => toggle(t.id)}
                />
              ))}
            </div>
          </div>
        ))}
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
