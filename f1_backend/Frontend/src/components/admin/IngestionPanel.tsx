import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Database, Loader2, RefreshCw, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { API, fmt, TelemetryBadge, useEnrichmentRetry } from './shared';
import { SessionDetailPanel } from './SessionDetailPanel';
import type { TelemetrySession } from './types';
import { telemetryApi, type AvailableSession, type IngestResponse } from '../../config/api';
import { makeSessionKey } from '../../utils/sessionKey';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 2017 }, (_, i) => CURRENT_YEAR - i);

type TokenFactory = () => Promise<string | null>;

export function IngestionPanel({ getToken }: { getToken: TokenFactory }) {
  const api = useMemo(() => telemetryApi(getToken), [getToken]);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [year, setYear]               = useState<number>(CURRENT_YEAR);
  const [gpName, setGpName]           = useState('');
  const [sessionType, setSessionType] = useState<string>('R');

  // ── Schedule (Fast-F1) ─────────────────────────────────────────────────────
  const [schedule, setSchedule]               = useState<AvailableSession[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError]     = useState('');

  // ── Ingest action ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<IngestResponse | null>(null);
  const [error, setError]     = useState('');

  // ── Ingested sessions list ─────────────────────────────────────────────────
  const [sessions, setSessions]               = useState<TelemetrySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);

  const loadSchedule = useCallback(async (y: number) => {
    setScheduleLoading(true);
    setScheduleError('');
    try {
      const data = await api.scheduleAvailable(y);
      setSchedule(data.sessions);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Failed to load schedule');
      setSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  }, [api]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch(`${API}/api/telemetry/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions ?? []);
      }
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const {
    retryTelemetry, retryPositions,
    retryingTelemetry, retryingPositions,
  } = useEnrichmentRetry(getToken, loadSessions);

  useEffect(() => { loadSchedule(year); }, [year, loadSchedule]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Poll while any session has a non-terminal telemetry OR position status
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const hasNonTerminal = sessions.some(s =>
      s.telemetryStatus === 'pending' || s.telemetryStatus === 'processing' ||
      s.positionsStatus === 'pending' || s.positionsStatus === 'processing',
    );
    if (hasNonTerminal && !pollRef.current) {
      pollRef.current = setInterval(loadSessions, 5000);
    } else if (!hasNonTerminal && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current && !hasNonTerminal) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [sessions, loadSessions]);

  // Group schedule by GP — each GP keeps its actual list of sessions (varies
  // by event format: conventional / sprint / sprint_shootout / sprint_qualifying).
  const gpOptions = useMemo(() => {
    const byGp = new Map<string, { meta: AvailableSession; sessions: AvailableSession[] }>();
    for (const s of schedule) {
      const entry = byGp.get(s.gpName);
      if (entry) entry.sessions.push(s);
      else byGp.set(s.gpName, { meta: s, sessions: [s] });
    }
    return Array.from(byGp.values()).sort((a, b) => a.meta.round - b.meta.round);
  }, [schedule]);

  const selectedGp = gpOptions.find(g => g.meta.gpName === gpName);
  const sessionOptions = selectedGp?.sessions ?? [];

  // Auto-pick first GP when schedule loads / year changes
  useEffect(() => {
    if (gpOptions.length === 0) { setGpName(''); return; }
    if (!gpOptions.find(g => g.meta.gpName === gpName)) {
      setGpName(gpOptions[0].meta.gpName);
    }
  }, [gpOptions, gpName]);

  // Auto-pick valid session type when GP changes (prefer 'R')
  useEffect(() => {
    if (sessionOptions.length === 0) return;
    if (!sessionOptions.find(s => s.sessionType === sessionType)) {
      const race = sessionOptions.find(s => s.sessionType === 'R');
      setSessionType((race ?? sessionOptions[sessionOptions.length - 1]).sessionType);
    }
  }, [sessionOptions, sessionType]);

  const previewKey = gpName ? makeSessionKey(year, gpName, sessionType) : '';
  const previewDate = sessionOptions.find(s => s.sessionType === sessionType)?.sessionDate ?? null;

  async function ingest(e: React.FormEvent) {
    e.preventDefault();
    if (!gpName) { setError('Select a Grand Prix'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const body = await api.ingest({ year, gpName, sessionType });
      setResult(body);
      await loadSessions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ingestion failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border border-neutral-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Database size={14} className="text-f1-red" />
          <span className="font-mono text-xs uppercase tracking-widest text-neutral-900 font-bold">
            Ingest Fast-F1 Session
          </span>
        </div>

        <form onSubmit={ingest} className="space-y-3">
          <div className="grid grid-cols-12 gap-3">
            {/* Year */}
            <div className="col-span-3">
              <label className="block font-mono text-[9px] uppercase tracking-widest text-neutral-500 mb-1">
                Year
              </label>
              <select
                value={year}
                onChange={e => setYear(Number(e.target.value))}
                disabled={loading}
                className="w-full border border-neutral-200 px-3 py-2 font-mono text-sm text-neutral-900 focus:outline-none focus:border-f1-red bg-white transition-colors"
              >
                {YEAR_OPTIONS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* GP */}
            <div className="col-span-6">
              <label className="block font-mono text-[9px] uppercase tracking-widest text-neutral-500 mb-1">
                Grand Prix {scheduleLoading && <Loader2 size={9} className="inline animate-spin ml-1" />}
              </label>
              <select
                value={gpName}
                onChange={e => setGpName(e.target.value)}
                disabled={loading || scheduleLoading || gpOptions.length === 0}
                className="w-full border border-neutral-200 px-3 py-2 font-mono text-sm text-neutral-900 focus:outline-none focus:border-f1-red bg-white transition-colors disabled:bg-neutral-50"
              >
                {gpOptions.length === 0 && <option value="">— No events —</option>}
                {gpOptions.map(g => (
                  <option key={g.meta.gpName} value={g.meta.gpName}>
                    R{String(g.meta.round).padStart(2, '0')} · {g.meta.gpName}
                    {g.meta.country ? ` · ${g.meta.country}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Session type — derived from selected GP's actual sessions */}
            <div className="col-span-3">
              <label className="block font-mono text-[9px] uppercase tracking-widest text-neutral-500 mb-1">
                Session
              </label>
              <select
                value={sessionType}
                onChange={e => setSessionType(e.target.value)}
                disabled={loading || sessionOptions.length === 0}
                className="w-full border border-neutral-200 px-3 py-2 font-mono text-sm text-neutral-900 focus:outline-none focus:border-f1-red bg-white transition-colors disabled:bg-neutral-50"
              >
                {sessionOptions.length === 0 && <option value="">—</option>}
                {sessionOptions.map(s => (
                  <option key={s.sessionType} value={s.sessionType}>
                    {s.sessionType} · {s.sessionName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="font-mono text-[10px] text-neutral-500">
              {previewKey ? (
                <>
                  Will ingest <span className="text-neutral-900">{previewKey}</span>
                  {previewDate && (
                    <span className="text-neutral-400"> · {fmt(previewDate)} UTC</span>
                  )}
                  {selectedGp?.meta.eventFormat && (
                    <span className="text-neutral-400"> · {selectedGp.meta.eventFormat}</span>
                  )}
                </>
              ) : (
                <span className="text-neutral-400">Pick year, GP, and session type</span>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || scheduleLoading || !gpName}
              className="flex items-center gap-2 bg-neutral-900 text-white px-5 py-2 font-mono text-xs uppercase tracking-widest hover:bg-f1-red disabled:opacity-40 transition-colors shrink-0"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
              {loading ? 'Ingesting…' : 'Ingest'}
            </button>
          </div>
        </form>

        {scheduleError && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 flex items-center gap-2">
            <AlertCircle size={12} className="text-amber-600" />
            <span className="font-mono text-[11px] text-amber-700">
              Schedule unavailable: {scheduleError}
            </span>
          </div>
        )}

        <AnimatePresence>
          {result && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-4 p-4 bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} className="text-emerald-600" />
                <span className="font-mono text-xs font-bold text-emerald-700 uppercase tracking-wider">
                  {result.status === 'cached' ? 'Cache Hit' : 'Ingested'} · {result.sessionKey}
                </span>
              </div>
              <div className="font-mono text-xs text-emerald-600 space-y-1">
                {result.lapsCount != null && <div>Laps processed: <strong>{result.lapsCount}</strong></div>}
                <div className="text-emerald-700/80">Run AI analysis from the Workflow tab when enrichment finishes.</div>
              </div>
            </motion.div>
          )}
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-4 p-4 bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <AlertCircle size={14} className="text-red-600" />
                <span className="font-mono text-xs text-red-700">{error}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedSessionKey ? (
        <SessionDetailPanel
          sessionKey={selectedSessionKey}
          getToken={getToken}
          onBack={() => setSelectedSessionKey(null)}
          onRetried={loadSessions}
        />
      ) : (
        <div className="border border-neutral-200">
          <div className="flex items-center justify-between px-6 py-3 border-b border-neutral-200 bg-neutral-50">
            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
              Ingested Sessions · click row for details
            </span>
            <button onClick={loadSessions} disabled={sessionsLoading}
              className="text-neutral-400 hover:text-neutral-700 transition-colors">
              <RefreshCw size={12} className={sessionsLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {sessionsLoading && sessions.length === 0 ? (
            <div className="py-12 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-neutral-300" /></div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center font-mono text-sm text-neutral-400">No sessions ingested yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100 text-[9px] uppercase tracking-widest text-neutral-400">
                    <th className="text-left px-4 py-2 font-normal">Session Key</th>
                    <th className="text-left px-2 py-2 font-normal">Circuit</th>
                    <th className="text-left px-2 py-2 font-normal">Year</th>
                    <th className="text-right px-2 py-2 font-normal">Drv</th>
                    <th className="text-right px-2 py-2 font-normal">Laps</th>
                    <th className="text-right px-2 py-2 font-normal">Agg</th>
                    <th className="text-right px-2 py-2 font-normal">Pos</th>
                    <th className="text-left px-2 py-2 font-normal">Ingested</th>
                    <th className="text-left px-2 py-2 font-normal">Telemetry</th>
                    <th className="text-left px-2 py-2 font-normal">Positions</th>
                    <th className="px-2 py-2 font-normal w-6" />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s => (
                    <tr
                      key={s.sessionKey}
                      onClick={() => setSelectedSessionKey(s.sessionKey)}
                      className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors cursor-pointer"
                    >
                      <td className="px-4 py-3 text-neutral-900">{s.sessionKey}</td>
                      <td className="px-2 py-3 text-neutral-600 max-w-[160px] truncate">{s.circuitName || '—'}</td>
                      <td className="px-2 py-3 text-neutral-500">{s.year || '—'}</td>
                      <td className="px-2 py-3 text-right text-neutral-700">{s.driverCount ?? '—'}</td>
                      <td className="px-2 py-3 text-right text-neutral-700">{s.lapCount ?? '—'}</td>
                      <td className="px-2 py-3 text-right text-neutral-700">{s.aggregateCount ?? '—'}</td>
                      <td className="px-2 py-3 text-right text-neutral-700">{s.positionsDriverCount ?? '—'}</td>
                      <td className="px-2 py-3 text-neutral-400">
                        {s.ingestedAt ? fmt(s.ingestedAt) : <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="px-2 py-3" title={s.telemetryError ?? undefined}>
                        <span className="inline-flex items-center gap-2">
                          <TelemetryBadge status={s.telemetryStatus} />
                          {s.telemetryStatus === 'failed' && (
                            <button
                              onClick={e => { e.stopPropagation(); retryTelemetry(s.sessionKey); }}
                              disabled={retryingTelemetry.has(s.sessionKey)}
                              title={s.telemetryError ?? 'Retry telemetry enrichment'}
                              className="text-neutral-400 hover:text-f1-red transition-colors disabled:opacity-40"
                            >
                              <RefreshCw size={11} className={retryingTelemetry.has(s.sessionKey) ? 'animate-spin' : ''} />
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-3" title={s.positionsError ?? undefined}>
                        <span className="inline-flex items-center gap-2">
                          {s.positionsStatus
                            ? <TelemetryBadge status={s.positionsStatus} />
                            : <span className="text-[10px] text-neutral-300">—</span>}
                          {s.positionsStatus === 'failed' && (
                            <button
                              onClick={e => { e.stopPropagation(); retryPositions(s.sessionKey); }}
                              disabled={retryingPositions.has(s.sessionKey)}
                              title={s.positionsError ?? 'Retry position enrichment'}
                              className="text-neutral-400 hover:text-f1-red transition-colors disabled:opacity-40"
                            >
                              <RefreshCw size={11} className={retryingPositions.has(s.sessionKey) ? 'animate-spin' : ''} />
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-neutral-300"><ChevronRight size={12} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
