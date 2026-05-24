'use client';

import { useFollowedFixtures } from '@/lib/useFollowedFixtures';
import { CardShell } from './CardShell';
import { LeagueCard } from './LeagueCard';
import { TeamCard } from './TeamCard';

export function ForYouMatchFeed() {
  const { data, isLoading, error } = useFollowedFixtures();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="mb-2 text-lg text-text">Could not load</p>
        <p className="text-sm text-muted">{(error as Error).message}</p>
      </div>
    );
  }

  const leagues = data?.leagues ?? [];
  const teams = data?.teams ?? [];

  if (leagues.length === 0 && teams.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="mb-2 text-lg text-text">Nothing here yet</p>
        <p className="text-sm text-muted">
          Follow leagues and teams to see recent results and upcoming fixtures.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {leagues.map((s) => (
        <CardShell key={s.entity.id} entity={s.entity}>
          <LeagueCard section={s} />
        </CardShell>
      ))}
      {teams.map((s) => (
        <CardShell key={s.entity.id} entity={s.entity}>
          <TeamCard section={s} />
        </CardShell>
      ))}
    </div>
  );
}
