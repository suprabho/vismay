import { useEffect, useState } from 'react';
import {
  telemetryApi,
  type CarPositionTrack,
  type CircuitGeometry,
  type LapTelemetryAggregate,
  type SectorBests,
} from '../config/api';

export interface RaceDriver {
  driverNumber:          number;
  fullName:              string;
  abbreviation:          string;
  teamName:              string;
  teamId?:               string;
  teamColour:            string;
  championshipPosition?: number | null;
  championshipPoints?:   number | null;
  championshipWins?:     number | null;
}

export interface SessionDetail {
  sessionKey:      string;
  sessionName:     string;
  circuitName:     string;
  country:         string;
  year:            number;
  circuitKey:      string;
  positionsStatus: 'pending' | 'processing' | 'done' | 'failed';
  drivers:         RaceDriver[];
}

export type AggregatesByDriverLap = Map<number, Map<number, LapTelemetryAggregate>>;

export interface RaceDataState {
  loading:  boolean;
  error:    string | null;
  session:  SessionDetail | null;
  circuit:  CircuitGeometry | null;
  tracks:   Map<number, CarPositionTrack>;
  /** Global t bounds across all driver tracks (min t0Ms, max tEndMs). */
  bounds:   { t0Ms: number; tEndMs: number } | null;
  /** Total lap count across all driver tracks. */
  totalLaps:    number;
  aggregates:   AggregatesByDriverLap;
  sectorBests:  SectorBests | null;
}

const EMPTY_TRACKS     = new Map<number, CarPositionTrack>();
const EMPTY_AGGREGATES = new Map<number, Map<number, LapTelemetryAggregate>>();

export function useRaceData(sessionKey: string | null): RaceDataState {
  const [state, setState] = useState<RaceDataState>({
    loading: false, error: null, session: null, circuit: null,
    tracks: EMPTY_TRACKS, bounds: null, totalLaps: 0,
    aggregates: EMPTY_AGGREGATES, sectorBests: null,
  });

  useEffect(() => {
    if (!sessionKey) {
      setState({ loading: false, error: null, session: null, circuit: null,
                 tracks: EMPTY_TRACKS, bounds: null, totalLaps: 0,
                 aggregates: EMPTY_AGGREGATES, sectorBests: null });
      return;
    }

    let cancelled = false;
    const api = telemetryApi();

    setState(s => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        // Step 1: session detail (gives circuitKey + drivers + positionsStatus)
        const session = await fetch(
          `${import.meta.env.VITE_API_URL ?? 'http://localhost:4000'}/api/telemetry/sessions/${sessionKey}`
        ).then(r => r.ok ? r.json() : Promise.reject(new Error(`Session fetch ${r.status}`)));

        if (cancelled) return;

        const detail: SessionDetail = {
          sessionKey:      session.sessionKey,
          sessionName:     session.sessionName ?? '',
          circuitName:     session.circuitName ?? '',
          country:         session.country ?? '',
          year:            session.year ?? 0,
          circuitKey:      session.circuitKey ?? '',
          positionsStatus: session.positionsStatus ?? 'pending',
          drivers:         (session.drivers ?? []) as RaceDriver[],
        };

        if (detail.positionsStatus !== 'done') {
          setState({
            loading: false,
            error: `Positions not ingested yet (status: ${detail.positionsStatus}). Retry from Admin.`,
            session: detail, circuit: null,
            tracks: EMPTY_TRACKS, bounds: null, totalLaps: 0,
            aggregates: EMPTY_AGGREGATES, sectorBests: null,
          });
          return;
        }

        // Step 2 + 3 + extras in parallel: circuit + positions list + aggregates + sector bests
        const [circuit, posList, aggregatesRes, sectorBests] = await Promise.all([
          detail.circuitKey ? api.circuit(detail.circuitKey, detail.year) : Promise.resolve(null as CircuitGeometry | null),
          api.listPositions(sessionKey),
          api.sessionAggregates(sessionKey).catch(err => {
            console.warn('[race] aggregates fetch failed', err);
            return { sessionKey, aggregates: [] as LapTelemetryAggregate[] };
          }),
          api.sectorBests(sessionKey).catch(err => {
            console.warn('[race] sector bests fetch failed', err);
            return null as SectorBests | null;
          }),
        ]);

        if (cancelled) return;

        // Step 4: parallel per-driver tracks
        const trackEntries = await Promise.all(
          posList.drivers.map(async d => {
            try {
              const track = await api.driverPositions(sessionKey, d.driverNumber);
              return [d.driverNumber, track] as const;
            } catch (err) {
              console.warn(`[race] failed to load positions for #${d.driverNumber}`, err);
              return null;
            }
          })
        );

        if (cancelled) return;

        const tracks = new Map<number, CarPositionTrack>();
        let minT = Infinity;
        let maxT = -Infinity;
        let maxLap = 0;
        for (const entry of trackEntries) {
          if (!entry) continue;
          const [dn, track] = entry;
          tracks.set(dn, track);
          if (track.t0Ms < minT) minT = track.t0Ms;
          if (track.tEndMs > maxT) maxT = track.tEndMs;
          const lastLap = track.frames.lap[track.frames.lap.length - 1] ?? 0;
          if (lastLap > maxLap) maxLap = lastLap;
        }

        // Index aggregates by driverNumber → lap → aggregate for O(1) lookups
        const aggregates: AggregatesByDriverLap = new Map();
        for (const agg of aggregatesRes.aggregates) {
          let perDriver = aggregates.get(agg.driverNumber);
          if (!perDriver) {
            perDriver = new Map();
            aggregates.set(agg.driverNumber, perDriver);
          }
          perDriver.set(agg.lap, agg);
        }

        setState({
          loading: false, error: null,
          session: detail,
          circuit,
          tracks,
          bounds: tracks.size > 0 ? { t0Ms: minT, tEndMs: maxT } : null,
          totalLaps: maxLap,
          aggregates,
          sectorBests,
        });
      } catch (err) {
        if (cancelled) return;
        setState(s => ({
          ...s, loading: false,
          error: err instanceof Error ? err.message : 'Failed to load race data',
        }));
      }
    })();

    return () => { cancelled = true; };
  }, [sessionKey]);

  return state;
}
