import { useEffect, useMemo, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import type { Signal, Story, ScopeKind } from '../../types';
import type { RaceDriver } from '../../hooks/useRaceData';
import { signalsApi, storiesApi } from '../../config/api';
import { useScopedGraphs } from '../../hooks/useScopedGraphs';
import { GraphBlock } from '../graphs/GraphBlock';

interface Props {
  sessionKey: string;
  currentLap: number;
  drivers:    RaceDriver[];
  scopeKind?: ScopeKind;          // optional scope filter
  driverNumber?: number | null;   // when scopeKind === 'driver'
  teamId?: string | null;         // when scopeKind === 'team'
  onStoryClick?: (slug: string) => void;
}

const PRIORITY_BORDER: Record<Signal['priority'], string> = {
  high: 'border-l-f1-red',
  med:  'border-l-caution-yellow',
  low:  'border-l-neutral-400',
};

const PRIORITY_BG: Record<Signal['priority'], string> = {
  high: 'bg-f1-red/5',
  med:  'bg-caution-yellow/5',
  low:  'bg-neutral-50',
};

const PRIORITY_TEXT: Record<Signal['priority'], string> = {
  high: 'text-f1-red',
  med:  'text-caution-yellow',
  low:  'text-neutral-500',
};

export function RaceSignalsTab({
  sessionKey, currentLap, drivers,
  scopeKind, driverNumber, teamId, onStoryClick,
}: Props) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const driverByNum = useMemo(
    () => new Map(drivers.map(d => [d.driverNumber, d])),
    [drivers],
  );

  const { graphs, loading: graphsLoading } = useScopedGraphs({
    sessionKey,
    scopeKind,
    driverNumber,
    teamId,
  });
  const showScopedGraphs =
    (scopeKind === 'driver' && driverNumber != null) ||
    (scopeKind === 'team'   && !!teamId);

  useEffect(() => {
    if (!sessionKey) return;
    let cancelled = false;
    setLoading(true); setError(null);

    const signalQuery: Parameters<ReturnType<typeof signalsApi>['list']>[0] = { sessionKey };
    if (scopeKind === 'driver' && driverNumber != null) {
      signalQuery.driverNumber = driverNumber;
    } else if (scopeKind === 'team' && teamId) {
      signalQuery.teamId = teamId;
    }

    const storyQuery: Record<string, string | number | undefined> = { sessionKey, limit: 20 };
    if (scopeKind && scopeKind !== 'session') storyQuery.scopeKind = scopeKind;
    if (scopeKind === 'driver' && driverNumber != null) storyQuery.driverNumber = driverNumber;
    if (scopeKind === 'team' && teamId) storyQuery.teamId = teamId;

    Promise.all([
      signalsApi().list(signalQuery) as Promise<{ signals: Signal[] }>,
      storiesApi().list(storyQuery) as Promise<{ stories: Story[] }>,
    ])
      .then(([sigRes, storyRes]) => {
        if (cancelled) return;
        setSignals((sigRes.signals ?? []).sort((a, b) => a.lap - b.lap));
        setStories(storyRes.stories ?? []);
      })
      .catch(e => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [sessionKey, scopeKind, driverNumber, teamId]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-neutral-100 bg-white">
        <h3 className="font-serif text-lg font-bold tracking-tight italic flex items-center gap-2">
          <Activity className="text-f1-red" size={18} />
          Intelligence Flow
          <span className="ml-auto font-mono text-[9px] text-neutral-400 uppercase tracking-widest">
            {signals.length} signals
          </span>
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-neutral-400">
            <Loader2 size={13} className="animate-spin" />
            <span className="font-mono text-xs">Loading signals…</span>
          </div>
        )}

        {error && (
          <p className="font-mono text-[11px] text-red-500">Signals load failed: {error}</p>
        )}

        {!loading && !error && signals.length === 0 && stories.length === 0 && (
          <p className="font-mono text-xs text-neutral-400">
            No AI signals or stories for this {scopeKind ?? 'session'} yet. Run analysis from the Admin Workflow panel.
          </p>
        )}

        {!loading && stories.length > 0 && (
          <div className="mb-4 pb-3 border-b border-neutral-100">
            <h4 className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 mb-2">
              Stories ({stories.length})
            </h4>
            <div className="space-y-2">
              {stories.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onStoryClick?.(s.slug)}
                  className="w-full text-left border border-neutral-200 hover:border-neutral-400 transition-colors p-2 bg-white"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[8px] uppercase tracking-widest text-neutral-400">
                      {s.scope?.kind === 'driver'
                        ? `Driver · #${s.scope.driverNumber}`
                        : s.scope?.kind === 'team'
                          ? `Team · ${s.scope.teamName ?? ''}`
                          : 'Session'}
                    </span>
                  </div>
                  <p className="font-sans text-[12px] font-semibold text-neutral-900 leading-snug line-clamp-2">
                    {s.title}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {showScopedGraphs && (
          <div className="mb-4 pb-3 border-b border-neutral-100">
            <h4 className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 mb-2">
              {scopeKind === 'driver' ? 'Driver Graphs' : 'Team Graphs'} ({graphs.length})
            </h4>
            {graphsLoading && (
              <div className="flex items-center gap-2 text-neutral-400">
                <Loader2 size={13} className="animate-spin" />
                <span className="font-mono text-xs">Loading graphs…</span>
              </div>
            )}
            {!graphsLoading && graphs.length === 0 && (
              <p className="font-mono text-xs text-neutral-400">
                No graphs generated yet for this {scopeKind}.
              </p>
            )}
            {!graphsLoading && graphs.length > 0 && (
              <div className="space-y-3">
                {graphs.map(g => (
                  <GraphBlock key={g.id} spec={g} />
                ))}
              </div>
            )}
          </div>
        )}

        {signals.map(sig => {
          const matches = sig.lap === currentLap;
          const driver  = sig.driverNumber != null ? driverByNum.get(sig.driverNumber) : null;
          return (
            <div
              key={sig.id}
              className={`border border-neutral-200 border-l-4 p-3 transition-colors ${PRIORITY_BORDER[sig.priority]} ${PRIORITY_BG[sig.priority]} ${
                matches ? 'ring-1 ring-f1-red shadow-md' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <span className={`font-mono text-[9px] uppercase tracking-widest font-bold ${PRIORITY_TEXT[sig.priority]}`}>
                  {sig.priority} · Lap {sig.lap}
                  {matches && <span className="ml-2 text-f1-red">● live</span>}
                </span>
                {driver && (
                  <span
                    className="font-mono text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 text-white"
                    style={{ backgroundColor: driver.teamColour || '#444' }}
                    title={driver.fullName}
                  >
                    {driver.abbreviation || `#${driver.driverNumber}`}
                  </span>
                )}
                <span className="font-mono text-[9px] text-neutral-400 ml-auto">{sig.location}</span>
              </div>
              <p className="font-sans font-bold text-neutral-900 text-sm leading-snug mb-1">
                {sig.title}
              </p>
              <p className="text-neutral-600 text-[11px] leading-relaxed mb-2">
                {sig.meaning}
              </p>
              {sig.implication && (
                <div className="bg-white border border-neutral-100 p-2 mt-2">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Implication</span>
                  <p className="text-neutral-700 text-[11px] leading-relaxed italic mt-0.5">{sig.implication}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
