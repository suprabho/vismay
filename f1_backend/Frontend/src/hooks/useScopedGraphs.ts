import { useEffect, useState } from 'react';
import { graphsApi } from '../config/api';
import type { GraphSpec, ScopeKind } from '../types';

interface Args {
  sessionKey:    string | null;
  scopeKind?:    ScopeKind;
  driverNumber?: number | null;
  teamId?:       string | null;
}

interface Result {
  loading: boolean;
  error:   string | null;
  graphs:  GraphSpec[];
}

export function useScopedGraphs({ sessionKey, scopeKind, driverNumber, teamId }: Args): Result {
  const [graphs,  setGraphs]  = useState<GraphSpec[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!sessionKey) { setGraphs([]); return; }
    const needsScope = scopeKind && scopeKind !== 'session';
    const scopeReady =
      scopeKind === 'driver' ? driverNumber != null :
      scopeKind === 'team'   ? !!teamId :
      true;
    if (needsScope && !scopeReady) { setGraphs([]); return; }

    let cancelled = false;
    setLoading(true); setError(null);

    const query: Parameters<ReturnType<typeof graphsApi>['list']>[0] = { sessionKey };
    if (scopeKind) query.scopeKind = scopeKind;
    if (scopeKind === 'driver' && driverNumber != null) query.driverNumber = driverNumber;
    if (scopeKind === 'team'   && teamId)              query.teamId       = teamId;

    (graphsApi().list(query) as Promise<{ graphs: GraphSpec[] }>)
      .then(res => { if (!cancelled) setGraphs(res.graphs ?? []); })
      .catch(e => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [sessionKey, scopeKind, driverNumber, teamId]);

  return { loading, error, graphs };
}
