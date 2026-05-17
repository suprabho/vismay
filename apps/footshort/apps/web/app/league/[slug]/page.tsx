'use client';

import { useParams } from 'next/navigation';
import { MatchRow } from '@/components/MatchRow';
import { StandingsTable } from '@/components/StandingsTable';
import { useEntity } from '@/lib/useEntity';
import { useLeagueFixtures, type FixtureRow } from '@/lib/useFixtures';
import { useStandings } from '@/lib/useStandings';

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
        ) : standings.data && standings.data.length > 0 ? (
          <StandingsTable rows={standings.data} />
        ) : (
          <p className="text-sm text-muted">No standings yet.</p>
        )}
      </Section>

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
