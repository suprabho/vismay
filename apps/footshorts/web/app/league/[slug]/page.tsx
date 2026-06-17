'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  MatchRow,
  StandingsTable,
  BracketTree,
  buildBracket,
  isBracketDrawn,
  groupFixturesByRound,
} from '@vismay/footshorts-viz/web';
import { useEntity } from '@/lib/useEntity';
import { useLeagueFixtures, type FixtureRow } from '@/lib/useFixtures';
import { useStandings, groupStandings } from '@/lib/useStandings';

type Tab = 'recent' | 'standings' | 'schedule' | 'glory';

const TAB_LABEL: Record<Tab, string> = {
  recent: 'Recent',
  standings: 'Standings',
  schedule: 'Schedule',
  glory: 'Road to Glory',
};

function Spinner() {
  return (
    <div className="flex items-center justify-center py-6">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{children}</h3>
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

function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <div className="mt-5 flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const isActive = t === active;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              isActive
                ? 'border-accent text-text'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {TAB_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

export default function LeaguePage() {
  const { slug } = useParams<{ slug: string }>();
  const [tab, setTab] = useState<Tab>('recent');

  const league = useEntity('league', slug);
  const standings = useStandings(slug);
  const pastFixtures = useLeagueFixtures(slug, 'past', 10);
  const upcomingFixtures = useLeagueFixtures(slug, 'upcoming', 10);
  // Full schedule for every competition — feeds both the Schedule tab and the
  // bracket. A complete domestic season is ~380 fixtures, so cap well above that.
  const scheduleFixtures = useLeagueFixtures(slug, 'all', 500);

  const standingGroups = useMemo(
    () => (standings.data ? groupStandings(standings.data) : []),
    [standings.data],
  );
  const bracket = useMemo(
    () => buildBracket(scheduleFixtures.data ?? []),
    [scheduleFixtures.data],
  );
  const bracketDrawn = isBracketDrawn(bracket);
  const scheduleRounds = useMemo(
    () => groupFixturesByRound(scheduleFixtures.data ?? []),
    [scheduleFixtures.data],
  );

  // Tabs surface only when their data exists. A competition with both a league
  // phase and knockouts (World Cup, new-format UCL) shows Standings AND Road to
  // Glory together. Recent is always available and is the default.
  const availableTabs = useMemo<Tab[]>(
    () => [
      'recent',
      ...(standingGroups.length > 0 ? (['standings'] as const) : []),
      ...(scheduleRounds.length > 0 ? (['schedule'] as const) : []),
      ...(bracket ? (['glory'] as const) : []),
    ],
    [standingGroups.length, scheduleRounds.length, bracket],
  );
  const activeTab: Tab = availableTabs.includes(tab) ? tab : 'recent';

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

      <TabBar tabs={availableTabs} active={activeTab} onChange={setTab} />

      <div className="mt-6">
        {activeTab === 'recent' ? (
          <div className="space-y-6">
            <section>
              <SubHeading>Recent results</SubHeading>
              <FixtureList
                loading={pastFixtures.isLoading}
                data={pastFixtures.data ?? []}
                emptyText="No recent results."
              />
            </section>
            <section>
              <SubHeading>Upcoming</SubHeading>
              <FixtureList
                loading={upcomingFixtures.isLoading}
                data={upcomingFixtures.data ?? []}
                emptyText="No upcoming fixtures."
              />
            </section>
          </div>
        ) : null}

        {activeTab === 'standings' ? (
          standings.isLoading ? (
            <Spinner />
          ) : standingGroups.length > 0 ? (
            <div className="space-y-5">
              {standingGroups.map((group) => (
                <div key={group.label || 'overall'}>
                  {group.label ? <SubHeading>{group.label}</SubHeading> : null}
                  <StandingsTable rows={group.rows} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No standings yet.</p>
          )
        ) : null}

        {activeTab === 'schedule' ? (
          scheduleFixtures.isLoading ? (
            <Spinner />
          ) : scheduleRounds.length > 0 ? (
            <div className="space-y-5">
              {scheduleRounds.map((round) => (
                <div key={round.key}>
                  <SubHeading>{round.label}</SubHeading>
                  <div className="overflow-hidden rounded-xl border border-border bg-surface">
                    {round.fixtures.map((f) => (
                      <MatchRow key={f.id} fixture={f} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No fixtures scheduled yet.</p>
          )
        ) : null}

        {activeTab === 'glory' ? (
          bracketDrawn ? (
            <BracketTree
              bracket={bracket!}
              competitionSlug={slug}
              competitionColor={league.data.primary_color ?? undefined}
              title={league.data.name}
            />
          ) : (
            <p className="text-sm text-muted">
              Knockout draw not set yet — see the Schedule tab for upcoming rounds.
            </p>
          )
        ) : null}
      </div>
    </main>
  );
}
