'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EntityChip } from '@/components/EntityChip';
import { useLeagues } from '@/lib/useEntities';
import { useFollowMutation } from '@/lib/useFollows';

const MIN_LEAGUES = 3;

export default function OnboardingLeagues() {
  const router = useRouter();
  const { data: leagues, isLoading } = useLeagues();
  const { follow } = useFollowMutation();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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
    await Promise.all(Array.from(picked).map((id) => follow.mutateAsync(id)));
    setBusy(false);
    const slugs = (leagues ?? []).filter((l) => picked.has(l.id)).map((l) => l.slug);
    router.push(`/onboarding/teams?leagues=${encodeURIComponent(slugs.join(','))}`);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
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
