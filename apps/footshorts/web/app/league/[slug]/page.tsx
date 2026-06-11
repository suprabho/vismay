'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  MatchRow,
  StandingsTable,
  BracketTree,
  buildBracket,
  isLeagueCompetition,
} from '@vismay/footshorts-viz/web';
import { useEntity } from '@/lib/useEntity';
import { useLeagueFixtures, type FixtureRow } from '@/lib/useFixtures';
import { useStandings, groupStandings } from '@/lib/useStandings';

function Spinner() {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-semibold text-text">{title}</h2>
      {children}
    </section>
  );
}

function FixtureList({
  loading,
  data,
  emptyText,
}: {
  loading: boolean;
  data: FixtureRow[];
  emptyText: string;
}) {
  if (loading) return <Spinner />;
  if (data.length === 0) return <p className="text-sm text-muted">{emptyText}</p>;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {data.map((f) => (
        <MatchRow key={f.id} fixture={f} />
      ))}
    </div>
  );
}

export default function LeaguePage() {
  const { slug } = useParams<{ slug: string }>();

  const league = useEntity('league', slug);
  const standings = useStandings(slug);
  const pastFixtures = useLeagueFixtures(slug, 'past', 10);
  const upcomingFixtures = useLeagueFixtures(slug, 'upcoming', 10);
  // Bracket only applies to cups/tournaments — skip the wide fetch for plain
  // leagues (which never have knockout fixtures) by disabling the query there.
  const isLeague = isLeagueCompetition(slug);
  const bracketFixtures = useLeagueFixtures(isLeague ? undefined : slug, 'all', 200);

  const standingGroups = useMemo(
    () => (standings.data ? groupStandings(standings.data) : []),
    [standings.data],
  );
  const bracket = useMemo(
    () => buildBracket(bracketFixtures.data ?? []),
    [bracketFixtures.data],
  );

  if (league.isLoading) return <Spinner />;

  if (!league.data) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12 text-center">
        <p className="text-base text-text">League not found</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-6">
      <header className="flex items-center gap-3">
        {league.data.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={league.data.crest_url}
            alt=""
            className="h-11 w-11 object-contain"
          />
        ) : null}
        <div>
          <h1 className="text-2xl font-bold text-text">{league.data.name}</h1>
          {league.data.country ? (
            <p className="mt-0.5 text-xs text-muted">{league.data.country}</p>
          ) : null}
        </div>
      </header>

      <Section title="Standings">
        {standings.isLoading ? (
          <Spinner />
        ) : standingGroups.length > 0 ? (
          <div className="space-y-5">
            {standingGroups.map((group) => (
              <div key={group.label || 'overall'}>
                {group.label ? (
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                    {group.label}
                  </h3>
                ) : null}
                <StandingsTable rows={group.rows} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No standings yet.</p>
        )}
      </Section>

      {bracket ? (
        <Section title="Knockout bracket">
          <BracketTree bracket={bracket} competitionSlug={slug} title={league.data.name} />
        </Section>
      ) : null}

      <Section title="Recent results">
        <FixtureList
          loading={pastFixtures.isLoading}
          data={pastFixtures.data ?? []}
          emptyText="No recent results."
        />
      </Section>

      <Section title="Upcoming">
        <FixtureList
          loading={upcomingFixtures.isLoading}
          data={upcomingFixtures.data ?? []}
          emptyText="No upcoming fixtures."
        />
      </Section>
    </main>
  );
}
