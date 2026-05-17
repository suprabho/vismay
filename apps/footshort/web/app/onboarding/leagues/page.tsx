'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { EntityChip } from '@vismay/footshort-viz/web';
import { useLeagues } from '@/lib/useEntities';
import { useFollowMutation, useFollows } from '@/lib/useFollows';

const MIN_LEAGUES = 3;

function PageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

function OnboardingLeaguesInner() {
  const router = useRouter();
  const params = useSearchParams();
  const edit = params.get('edit');
  const { data: leagues, isLoading } = useLeagues();
  const { data: follows } = useFollows();
  const { follow, unfollow } = useFollowMutation();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (seeded || !leagues) return;
    if (edit && !follows) return;
    if (edit && follows) {
      const followed = new Set(follows.map((f) => f.entity_id));
      const seed = new Set(leagues.filter((l) => followed.has(l.id)).map((l) => l.id));
      setPicked(seed);
      setInitial(seed);
    }
    setSeeded(true);
  }, [leagues, follows, edit, seeded]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function next() {
    setBusy(true);
    const toFollow = Array.from(picked).filter((id) => !initial.has(id));
    const toUnfollow = Array.from(initial).filter((id) => !picked.has(id));
    await Promise.all([
      ...toFollow.map((id) => follow.mutateAsync(id)),
      ...toUnfollow.map((id) => unfollow.mutateAsync(id)),
    ]);
    setBusy(false);
    const slugs = (leagues ?? []).filter((l) => picked.has(l.id)).map((l) => l.slug);
    const qs = new URLSearchParams({ leagues: slugs.join(',') });
    if (edit) qs.set('edit', '1');
    router.push(`/onboarding/teams?${qs.toString()}`);
  }

  if (isLoading) {
    return <PageSpinner />;
  }

  const canContinue = picked.size >= MIN_LEAGUES;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="px-6 pt-8">
        <h1 className="mb-1 text-3xl font-bold text-text">Pick your leagues</h1>
        <p className="mb-6 text-sm text-muted">
          Choose at least {MIN_LEAGUES}. ({picked.size} selected)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="flex flex-wrap">
          {leagues?.map((l) => (
            <EntityChip
              key={l.id}
              name={l.name}
              crestUrl={l.crest_url}
              selected={picked.has(l.id)}
              onClick={() => toggle(l.id)}
            />
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-bg px-6 py-4">
        <button
          type="button"
          onClick={next}
          disabled={!canContinue || busy}
          className={`w-full rounded-lg py-3 font-semibold ${
            canContinue && !busy ? 'bg-accent text-bg' : 'bg-surface text-muted'
          }`}
        >
          {busy ? '…' : 'Continue'}
        </button>
      </div>
    </div>
  );
}

export default function OnboardingLeagues() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <OnboardingLeaguesInner />
    </Suspense>
  );
}
