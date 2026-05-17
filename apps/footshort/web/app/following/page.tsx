'use client';

import Link from 'next/link';
import { EntityChip } from '@/components/EntityChip';
import { useFollows, useFollowMutation } from '@/lib/useFollows';

export default function FollowingPage() {
  const { data: follows, isLoading } = useFollows();
  const { unfollow } = useFollowMutation();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const byType = {
    league: follows?.filter((f) => f.entity.type === 'league') ?? [],
    team: follows?.filter((f) => f.entity.type === 'team') ?? [],
    player: follows?.filter((f) => f.entity.type === 'player') ?? [],
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-6">
      <h1 className="mb-6 text-2xl font-bold text-text">Following</h1>

      <Link
        href="/onboarding/leagues?edit=1"
        className="mb-6 block rounded-lg border border-border py-3 text-center font-semibold text-text hover:border-muted"
      >
        Edit preferences
      </Link>

      <p className="mb-6 text-sm text-muted">Tap to unfollow.</p>

      {(['league', 'team', 'player'] as const).map((type) =>
        byType[type].length > 0 ? (
          <div key={type} className="mb-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted">
              {type}s · {byType[type].length}
            </p>
            <div className="flex flex-wrap">
              {byType[type].map((f) => (
                <EntityChip
                  key={f.entity_id}
                  name={f.entity.name}
                  crestUrl={f.entity.crest_url}
                  selected
                  onClick={() => unfollow.mutate(f.entity_id)}
                />
              ))}
            </div>
          </div>
        ) : null
      )}

      {(!follows || follows.length === 0) && (
        <p className="text-sm text-muted">You&apos;re not following anything yet.</p>
      )}
    </main>
  );
}
