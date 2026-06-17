'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { MatchRow, MatchTimeline, getCompetitionDisplayName } from '@vismay/footshorts-viz/web';
import type { EventTypeFilter } from '@vismay/footshorts-viz/web';
import { useFixtureDetail } from '@/lib/useFixtureDetail';

// Timeline filter tabs (value → label). Values mirror FixtureEventType; 'subst'
// is the type value even though the tab reads "Subs".
const FILTER_TABS: ReadonlyArray<[EventTypeFilter, string]> = [
  ['all', 'All'],
  ['goal', 'Goals'],
  ['card', 'Cards'],
  ['subst', 'Subs'],
];

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

function kickoffLine(iso: string): string {
  const d = new Date(iso);
  // UTC, deterministic for SSR — MatchRow localizes the hero time itself.
  return `${d.toISOString().slice(0, 10)} · ${d.toISOString().slice(11, 16)} UTC`;
}

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [filter, setFilter] = useState<EventTypeFilter>('all');
  const { data, isLoading, isError } = useFixtureDetail(id);

  if (isLoading) return <Spinner />;

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-2xl px-5 py-12 text-center">
        <p className="text-base text-text">Match not found</p>
      </main>
    );
  }

  const { fixture, events } = data;
  const competition = getCompetitionDisplayName(fixture.competition_slug);
  const meta = [
    competition,
    fixture.matchday != null ? `Matchday ${fixture.matchday}` : null,
    kickoffLine(fixture.kickoff_at),
  ]
    .filter(Boolean)
    .join(' · ');

  const isFinished = fixture.status === 'finished';

  return (
    <main className="mx-auto max-w-2xl px-5 py-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="mb-4 text-sm text-accent transition-opacity hover:opacity-80"
      >
        ← Back
      </button>
      <header className="mb-4">
        <Link href={`/league/${fixture.competition_slug}`} className="text-xs text-accent">
          {competition}
        </Link>
        <p className="mt-1 text-xs text-muted">{meta}</p>
      </header>

      {/* Scoreboard hero — reuses the expanded MatchRow (stacked crests + score). */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <MatchRow fixture={fixture} variant="expanded" />
      </div>

      <Section title="Timeline">
        <div className="mb-3 flex gap-2">
          {FILTER_TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${
                filter === value
                  ? 'bg-accent text-surface'
                  : 'border border-border text-text hover:bg-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-surface px-4 py-2">
          <MatchTimeline
            events={events}
            filter={filter}
            emptyText={
              isFinished
                ? 'No event data for this match yet.'
                : 'Events appear once the match is finished.'
            }
          />
        </div>
      </Section>
    </main>
  );
}
