'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MatchRow } from '@/components/MatchRow';
import { useEntity, usePlayersInTeam } from '@/lib/useEntity';
import { useTeamFixtures, type FixtureRow } from '@/lib/useFixtures';
import { useTeamStanding } from '@/lib/useStandings';

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

function Stat({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number | string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className={`text-[10px] ${emphasis ? 'text-accent' : 'text-muted'}`}>{label}</span>
      <span className={`mt-0.5 text-sm ${emphasis ? 'font-semibold text-accent' : 'text-text'}`}>
        {value}
      </span>
    </div>
  );
}

export default function TeamPage() {
  const { slug } = useParams<{ slug: string }>();

  const team = useEntity('team', slug);
  const teamId = team.data?.id;
  const leagueSlug = team.data?.league_slug ?? undefined;

  const standing = useTeamStanding(teamId, leagueSlug);
  const pastFixtures = useTeamFixtures(teamId, 'past', 10);
  const upcomingFixtures = useTeamFixtures(teamId, 'upcoming', 5);
  const players = usePlayersInTeam(slug);

  if (team.isLoading) return <Spinner />;

  if (!team.data) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12 text-center">
        <p className="text-base text-text">Team not found</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-6">
      <header className="flex items-center gap-3">
        {team.data.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={team.data.crest_url} alt="" className="h-13 w-13 object-contain" />
        ) : null}
        <div>
          <h1 className="text-2xl font-bold text-text">{team.data.name}</h1>
          {leagueSlug ? (
            <Link href={`/league/${leagueSlug}`} className="mt-1 inline-block text-xs text-accent">
              {leagueSlug}
            </Link>
          ) : null}
        </div>
      </header>

      {standing.data ? (
        <div className="mt-6">
          <div className="flex rounded-xl border border-border bg-surface px-4 py-3">
            <Stat label="Pos" value={`#${standing.data.position}`} />
            <Stat label="P" value={standing.data.played} />
            <Stat label="W" value={standing.data.won} />
            <Stat label="D" value={standing.data.draw} />
            <Stat label="L" value={standing.data.lost} />
            <Stat label="GD" value={standing.data.goal_difference} />
            <Stat label="Pts" value={standing.data.points} emphasis />
          </div>
          {standing.data.form ? (
            <p className="mt-2 text-xs text-muted">Form: {standing.data.form}</p>
          ) : null}
        </div>
      ) : null}

      <Section title="Upcoming">
        <FixtureList
          loading={upcomingFixtures.isLoading}
          data={upcomingFixtures.data ?? []}
          emptyText="No upcoming fixtures."
        />
      </Section>

      <Section title="Recent results">
        <FixtureList
          loading={pastFixtures.isLoading}
          data={pastFixtures.data ?? []}
          emptyText="No recent results."
        />
      </Section>

      <Section title="Squad">
        {players.isLoading ? (
          <Spinner />
        ) : players.data && players.data.length > 0 ? (
          <div className="flex flex-col gap-2">
            {players.data.map((p) => (
              <Link
                key={p.id}
                href={`/player/${p.slug}`}
                className="rounded-xl border border-border bg-surface px-3 py-3 text-sm text-text hover:border-muted"
              >
                {p.name}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No players listed yet.</p>
        )}
      </Section>
    </main>
  );
}
