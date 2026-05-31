const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type TokenFactory = () => Promise<string | null>;

async function apiFetch<T>(
  path: string,
  getToken?: TokenFactory,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (getToken) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Stories ──────────────────────────────────────────────────────────────────

export function storiesApi(getToken?: TokenFactory) {
  return {
    list: (query: Record<string, string | number | undefined> = {}) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) params.set(k, String(v));
      }
      const qs = params.toString();
      return apiFetch<{ stories: unknown[]; total: number; page: number; pages: number }>(
        `/api/stories${qs ? `?${qs}` : ''}`,
        getToken,
      );
    },

    get: (slug: string) =>
      apiFetch<unknown>(`/api/stories/${slug}`, getToken),

    create: (data: Record<string, unknown>) =>
      apiFetch<unknown>('/api/stories', getToken, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Record<string, unknown>) =>
      apiFetch<unknown>(`/api/stories/${id}`, getToken, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    publish: (id: string) =>
      apiFetch<unknown>(`/api/stories/${id}/publish`, getToken, { method: 'PATCH' }),

    archive: (id: string) =>
      apiFetch<unknown>(`/api/stories/${id}`, getToken, { method: 'DELETE' }),

    permanentDelete: (id: string) =>
      apiFetch<unknown>(`/api/stories/${id}/permanent`, getToken, { method: 'DELETE' }),

    restore: (id: string) =>
      apiFetch<unknown>(`/api/stories/${id}`, getToken, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'draft' }),
      }),

    generate: (id: string, payload: { sessionKey?: string; context?: string }) =>
      apiFetch<{ runId: string; status: string }>(`/api/stories/${id}/generate`, getToken, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    runStatus: (id: string) =>
      apiFetch<{ runId: string; status: string; logs: string[]; completedAt?: string }>(
        `/api/stories/${id}/run-status`,
        getToken,
      ),
  };
}

// ── Graphs ───────────────────────────────────────────────────────────────────

export interface GraphsListQuery {
  storyId?:      string;
  sessionKey?:   string;
  driverNumber?: number;
  teamId?:       string;
  scopeKind?:    'session' | 'driver' | 'team';
}

export function graphsApi(getToken?: TokenFactory) {
  return {
    list: (query: GraphsListQuery = {}) => {
      const params = new URLSearchParams();
      if (query.storyId)       params.set('storyId',      query.storyId);
      if (query.sessionKey)    params.set('sessionKey',   query.sessionKey);
      if (query.driverNumber !== undefined) params.set('driverNumber', String(query.driverNumber));
      if (query.teamId)        params.set('teamId',       query.teamId);
      if (query.scopeKind)     params.set('scopeKind',    query.scopeKind);
      const qs = params.toString();
      return apiFetch<{ graphs: unknown[] }>(
        `/api/graphs${qs ? `?${qs}` : ''}`,
        getToken,
      );
    },

    get: (id: string) =>
      apiFetch<unknown>(`/api/graphs/${id}`, getToken),

    create: (data: Record<string, unknown>) =>
      apiFetch<unknown>('/api/graphs', getToken, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: Record<string, unknown>) =>
      apiFetch<unknown>(`/api/graphs/${id}`, getToken, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      apiFetch<unknown>(`/api/graphs/${id}`, getToken, { method: 'DELETE' }),
  };
}

// ── Signals ──────────────────────────────────────────────────────────────────

export interface SignalsListQuery {
  sessionKey?:   string;
  driverNumber?: number;
  teamId?:       string;
  scopeKind?:    'session' | 'driver' | 'team';
  priority?:     'high' | 'med' | 'low';
}

export function signalsApi(getToken?: TokenFactory) {
  return {
    list: (queryOrSessionKey?: SignalsListQuery | string) => {
      const query: SignalsListQuery =
        typeof queryOrSessionKey === 'string'
          ? { sessionKey: queryOrSessionKey }
          : queryOrSessionKey ?? {};
      const params = new URLSearchParams();
      if (query.sessionKey)    params.set('sessionKey',   query.sessionKey);
      if (query.driverNumber !== undefined) params.set('driverNumber', String(query.driverNumber));
      if (query.teamId)        params.set('teamId',       query.teamId);
      if (query.scopeKind)     params.set('scopeKind',    query.scopeKind);
      if (query.priority)      params.set('priority',     query.priority);
      const qs = params.toString();
      return apiFetch<{ signals: unknown[] }>(`/api/signals${qs ? `?${qs}` : ''}`, getToken);
    },
  };
}

// ── Analysis Angles ────────────────────────────────────────────────────────────

export type AnglePriority  = 'high' | 'med' | 'low';
export type AngleScopeKind = 'driver' | 'team';
export type AngleStatus    = 'proposed' | 'selected' | 'rejected' | 'generated';

export interface AnalysisAngle {
  id:                  string;
  _id:                 string;
  sessionKey:          string;
  runId:               string | null;
  scopeKind:           AngleScopeKind;
  driverNumber:        number | null;
  teamId:              string | null;
  teamName:            string | null;
  title:               string;
  focus:               string;
  rationale:           string;
  priority:            AnglePriority;
  supportingSignalIds: string[];
  status:              AngleStatus;
  storyId:             string | null;
}

export interface AnglesListQuery {
  sessionKey?:   string;
  runId?:        string;
  scopeKind?:    AngleScopeKind;
  driverNumber?: number;
  teamId?:       string;
  status?:       AngleStatus;
}

export function anglesApi(getToken?: TokenFactory) {
  return {
    list: (query: AnglesListQuery = {}) => {
      const params = new URLSearchParams();
      if (query.sessionKey)              params.set('sessionKey',   query.sessionKey);
      if (query.runId)                   params.set('runId',        query.runId);
      if (query.scopeKind)               params.set('scopeKind',    query.scopeKind);
      if (query.driverNumber !== undefined) params.set('driverNumber', String(query.driverNumber));
      if (query.teamId)                  params.set('teamId',       query.teamId);
      if (query.status)                  params.set('status',       query.status);
      params.set('limit', '500');
      const qs = params.toString();
      return apiFetch<{ angles: AnalysisAngle[]; total: number }>(
        `/api/analysis-angles${qs ? `?${qs}` : ''}`,
        getToken,
      );
    },

    update: (id: string, data: Partial<Pick<AnalysisAngle, 'title' | 'focus' | 'priority' | 'status'>>) =>
      apiFetch<AnalysisAngle>(`/api/analysis-angles/${id}`, getToken, {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),

    bulkSelect: (ids: string[], status: 'selected' | 'rejected' | 'proposed') =>
      apiFetch<{ matched: number; modified: number }>(`/api/analysis-angles/bulk-select`, getToken, {
        method: 'POST',
        body:   JSON.stringify({ ids, status }),
      }),
  };
}

// ── Telemetry ─────────────────────────────────────────────────────────────────

export interface AvailableSession {
  sessionKey:   string;
  year:         number;
  round:        number;
  gpName:       string;
  sessionType:  string;
  sessionName:  string;
  sessionDate:  string | null;
  country:      string;
  circuitName:  string;
  eventFormat:  string;
}

export interface IngestRequest {
  year:        number;
  gpName:      string;
  sessionType: string;
}

export interface IngestResponse {
  sessionKey:  string;
  status:      'ingested' | 'cached';
  lapsCount?:  number;
  ingestedAt?: string;
}

export interface SessionStatus {
  sessionKey:        string;
  telemetryStatus:   'pending' | 'processing' | 'done' | 'failed';
  telemetryError:    string | null;
  positionsStatus:   'pending' | 'processing' | 'done' | 'failed';
  positionsError:    string | null;
  circuitKey:        string;
  ingestedAt:        string | null;
  lapAggregateCount: number;
}

export interface CarPositionFrames {
  t:      number[];
  x:      number[];
  y:      number[];
  lap:    number[];
  status: number[];
}

export interface CarPositionTrack {
  sessionKey:   string;
  circuitKey:   string;
  driverNumber: number;
  sampleRateHz: number;
  frameCount:   number;
  t0Ms:         number;
  tEndMs:       number;
  frames:       CarPositionFrames;
}

export interface CircuitGeometry {
  circuitKey:  string;
  year:        number;
  gpName:      string;
  circuitName: string;
  country:     string;
  rotationDeg: number;
  corners: {
    number: number; letter: string;
    x: number; y: number;
    angle: number; distance: number;
  }[];
  outline: { x: number[]; y: number[] };
  bounds:  { minX: number; maxX: number; minY: number; maxY: number } | null;
  sectorBoundaries?: { index1: number; index2: number } | null;
}

export interface ProcessedLap {
  driverNumber: number;
  lap:          number;
  lapTimeSec:   number | null;
  sectors:      Array<number | null>;
  compound:     string;
  stintLap:     number;
  events:       string[];
  position?:    number | null;
}

export interface LapTelemetryAggregate {
  driverNumber:    number;
  lap:             number;
  avgSpeed:        number;
  maxSpeed:        number;
  avgThrottlePct:  number;
  brakingEvents:   number;
  drsActivations:  number;
  topGear:         number;
  lapDistanceM:    number;
  sector1MaxSpeed: number;
  sector2MaxSpeed: number;
  sector3MaxSpeed: number;
  avgGapToAheadM:  number;
  minGapToAheadM:  number;
}

export interface DriverSectorBest {
  s1: number; s2: number; s3: number;
  s1Lap: number; s2Lap: number; s3Lap: number;
}

export interface PurpleSector {
  time: number; driverNumber: number; lap: number;
}

export interface SectorBests {
  sessionKey:    string;
  driverBests:   Record<number, DriverSectorBest>;
  sessionPurple: { s1: PurpleSector | null; s2: PurpleSector | null; s3: PurpleSector | null };
}

export function telemetryApi(getToken?: TokenFactory) {
  return {
    sessions: () =>
      apiFetch<{ sessions: unknown[] }>('/api/telemetry/sessions', getToken),

    scheduleAvailable: (year: number) =>
      apiFetch<{ sessions: AvailableSession[]; cached: boolean }>(
        `/api/telemetry/sessions/available?year=${year}`,
        getToken,
      ),

    ingest: (body: IngestRequest) =>
      apiFetch<IngestResponse>('/api/telemetry/ingest', getToken, {
        method: 'POST',
        body:   JSON.stringify(body),
      }),

    sessionStatus: (sessionKey: string) =>
      apiFetch<SessionStatus>(`/api/telemetry/sessions/${sessionKey}/status`, getToken),

    retryEnrichment: (sessionKey: string) =>
      apiFetch<{ sessionKey: string; status: string }>(
        `/api/telemetry/sessions/${sessionKey}/retry`,
        getToken,
        { method: 'POST' },
      ),

    retryPositions: (sessionKey: string) =>
      apiFetch<{ sessionKey: string; status: string }>(
        `/api/telemetry/sessions/${sessionKey}/retry-positions`,
        getToken,
        { method: 'POST' },
      ),

    listPositions: (sessionKey: string) =>
      apiFetch<{ sessionKey: string; drivers: Array<{
        driverNumber: number; sampleRateHz: number; frameCount: number;
        t0Ms: number; tEndMs: number; circuitKey: string;
      }> }>(`/api/telemetry/sessions/${sessionKey}/positions`, getToken),

    driverPositions: (sessionKey: string, driverNumber: number, opts?: { lapFrom?: number; lapTo?: number }) => {
      const params = new URLSearchParams();
      if (opts?.lapFrom != null) params.set('lapFrom', String(opts.lapFrom));
      if (opts?.lapTo   != null) params.set('lapTo',   String(opts.lapTo));
      const qs = params.toString();
      return apiFetch<CarPositionTrack>(
        `/api/telemetry/sessions/${sessionKey}/positions/${driverNumber}${qs ? `?${qs}` : ''}`,
        getToken,
      );
    },

    circuit: (circuitKey: string, year?: number) =>
      apiFetch<CircuitGeometry>(
        `/api/telemetry/circuits/${circuitKey}${year ? `?year=${year}` : ''}`,
        getToken,
      ),

    driverLaps: (sessionKey: string, driverNumber: number) =>
      apiFetch<{ sessionKey: string; laps: ProcessedLap[] }>(
        `/api/telemetry/sessions/${sessionKey}/laps?driver=${driverNumber}`,
        getToken,
      ),

    sessionAggregates: (sessionKey: string, driverNumber?: number) => {
      const qs = driverNumber != null ? `?driver=${driverNumber}` : '';
      return apiFetch<{ sessionKey: string; aggregates: LapTelemetryAggregate[] }>(
        `/api/telemetry/sessions/${sessionKey}/aggregates${qs}`,
        getToken,
      );
    },

    sectorBests: (sessionKey: string) =>
      apiFetch<SectorBests>(`/api/telemetry/sessions/${sessionKey}/sector-bests`, getToken),

    sessionSummary: (sessionKey: string) =>
      apiFetch<import('../components/admin/types').SessionSummary>(
        `/api/admin/sessions/${sessionKey}/summary`,
        getToken,
      ),
  };
}
