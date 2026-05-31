import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2, RefreshCw, Play, X, AlertCircle, Terminal, Radio,
  ChevronDown, ChevronUp, Zap, Trash2,
} from 'lucide-react';
import { API, statusColor, StatusIcon, pipelineLabel, fmt, shortId, fmtDuration, TelemetryBadge } from './shared';
import type { StoryRun, RunStatus, RunPipeline, TelemetrySession } from './types';

// ── Trigger Modal ─────────────────────────────────────────────────────────────

function TriggerRunModal({
  onClose,
  onTrigger,
}: {
  onClose:   () => void;
  onTrigger: (sessionKey: string, pipeline: RunPipeline, storyId?: string) => Promise<void>;
}) {
  const [sessions, setSessions]             = useState<TelemetrySession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionKey, setSessionKey] = useState('');
  const [pipeline, setPipeline]     = useState<RunPipeline>('langraph_telemetry');
  const [storyId, setStoryId]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    setSessionsLoading(true);
    fetch(`${API}/api/telemetry/sessions`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then((d: { sessions: TelemetrySession[] }) => {
        const all = d.sessions ?? [];
        setSessions(all);
        const firstReady = all.find(s => s.telemetryStatus === 'done');
        if (firstReady) setSessionKey(firstReady.sessionKey);
      })
      .finally(() => setSessionsLoading(false));
  }, []);

  const readySessions = sessions.filter(s => s.telemetryStatus === 'done');
  const pendingCount  = sessions.length - readySessions.length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionKey.trim()) { setError('Select a session'); return; }
    setLoading(true); setError('');
    try {
      await onTrigger(sessionKey.trim(), pipeline, storyId.trim() || undefined);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to trigger run');
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-white border border-neutral-200 w-full max-w-md mx-4 shadow-2xl"
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-f1-red" />
            <span className="font-mono text-sm font-bold tracking-wider uppercase text-neutral-900">
              Trigger Pipeline Run
            </span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5">
              Session {sessionsLoading && <Loader2 size={9} className="inline animate-spin ml-1" />}
            </label>
            {sessions.length === 0 && !sessionsLoading ? (
              <p className="font-mono text-[11px] text-neutral-500 border border-neutral-200 px-3 py-2">
                No ingested sessions. Use the Ingest panel first.
              </p>
            ) : readySessions.length === 0 ? (
              <p className="font-mono text-[11px] text-amber-700 border border-amber-200 bg-amber-50 px-3 py-2">
                {pendingCount} session{pendingCount === 1 ? '' : 's'} still enriching — wait or retry in Ingest tab.
              </p>
            ) : (
              <>
                <select
                  value={sessionKey}
                  onChange={e => setSessionKey(e.target.value)}
                  disabled={sessionsLoading}
                  className="w-full border border-neutral-200 px-3 py-2 font-mono text-sm text-neutral-900 focus:outline-none focus:border-f1-red bg-white transition-colors"
                >
                  {readySessions.map(s => (
                    <option key={s.sessionKey} value={s.sessionKey}>
                      {s.sessionKey} · {s.circuitName || '—'} · {s.year}
                    </option>
                  ))}
                </select>
                {pendingCount > 0 && (
                  <p className="font-mono text-[10px] text-neutral-400 mt-1">
                    {pendingCount} more session{pendingCount === 1 ? '' : 's'} not yet enriched (hidden).
                  </p>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5">
              Pipeline
            </label>
            <select
              value={pipeline} onChange={e => setPipeline(e.target.value as RunPipeline)}
              className="w-full border border-neutral-200 px-3 py-2 font-mono text-sm text-neutral-900 focus:outline-none focus:border-f1-red bg-white transition-colors"
            >
              <option value="langraph_telemetry">LangGraph · Telemetry Analysis</option>
              <option value="crew_story">CrewAI · Story Generation</option>
              <option value="full">Full Pipeline (Both)</option>
            </select>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5">
              Story ID <span className="text-neutral-300">(optional)</span>
            </label>
            <input
              value={storyId} onChange={e => setStoryId(e.target.value)}
              placeholder="MongoDB ObjectId"
              className="w-full border border-neutral-200 px-3 py-2 font-mono text-sm text-neutral-900 focus:outline-none focus:border-f1-red transition-colors"
            />
          </div>

          {error && (
            <p className="flex items-center gap-2 text-red-600 font-mono text-xs">
              <AlertCircle size={12} /> {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-neutral-200 py-2 font-mono text-xs uppercase tracking-widest text-neutral-500 hover:border-neutral-400 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 bg-neutral-900 text-white py-2 font-mono text-xs uppercase tracking-widest hover:bg-f1-red disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {loading ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {loading ? 'Queuing…' : 'Queue Run'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// ── Run Row ───────────────────────────────────────────────────────────────────

type TokenFactory = () => Promise<string | null>;

function RunRow({ run, getToken, onDelete }: { run: StoryRun; getToken: TokenFactory; onDelete: (id: string) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail]     = useState<StoryRun | null>(null);
  const [polling, setPolling]   = useState(false);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDetail = useCallback(async () => {
    try {
      const t = await getToken();
      const res = await fetch(`${API}/api/admin/runs/${run._id}`, {
        headers: { Authorization: `Bearer ${t ?? ''}` },
      });
      if (res.ok) setDetail(await res.json());
    } catch { /* ignore */ }
  }, [run._id, getToken]);

  useEffect(() => {
    if (expanded) {
      fetchDetail();
      if (run.status === 'running') {
        setPolling(true);
        intervalRef.current = setInterval(fetchDetail, 3000);
      }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); setPolling(false); };
  }, [expanded, run.status, fetchDetail]);

  useEffect(() => {
    if (detail?.status !== 'running' && polling) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPolling(false);
    }
  }, [detail?.status, polling]);

  const logs = detail?.logs ?? [];
  const view = detail ?? run;
  const outputs = view.outputRef ?? {};
  const graphCount  = outputs.graphIds?.length  ?? 0;
  const signalCount = outputs.signalIds?.length ?? 0;
  const triggeredLabel =
    view.triggeredBy?.displayName ?? view.triggeredBy?.email ?? '—';

  return (
    <div className="border-b border-neutral-100 last:border-0">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-neutral-50 transition-colors text-left"
      >
        <span className="font-mono text-[11px] text-neutral-400 w-16 shrink-0">#{shortId(run._id)}</span>
        <span className="font-mono text-sm text-neutral-700 w-24 shrink-0 truncate">{run.sessionKey}</span>
        <span className="w-20 shrink-0 hidden md:flex items-center">
          {run.sessionTelemetryStatus
            ? <TelemetryBadge status={run.sessionTelemetryStatus} />
            : <span className="font-mono text-[10px] text-neutral-300">—</span>}
        </span>
        <span className="font-mono text-xs text-neutral-500 flex-1 truncate hidden sm:block">{pipelineLabel(run.pipeline)}</span>
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider ${statusColor(run.status)}`}>
          <StatusIcon status={run.status} />
          {run.status}
        </span>
        <span className="font-mono text-[11px] text-neutral-400 w-16 shrink-0 text-right hidden lg:block">{fmtDuration(run.durationMs)}</span>
        <span className="font-mono text-[11px] text-neutral-400 w-32 shrink-0 text-right hidden md:block">{fmt(run.createdAt)}</span>
        <span className="text-neutral-300 shrink-0">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mx-6 mb-4 bg-neutral-950 border border-neutral-800">
              <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800">
                <div className="flex items-center gap-2">
                  <Terminal size={12} className="text-neutral-500" />
                  <span className="font-mono text-[10px] text-neutral-500 uppercase tracking-widest">
                    Run Logs — {run._id}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {polling && (
                    <span className="flex items-center gap-1.5 font-mono text-[10px] text-amber-400">
                      <Radio size={10} className="animate-pulse" /> Live
                    </span>
                  )}
                  <button
                    onClick={() => onDelete(run._id)}
                    className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-red-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={10} /> Delete Run
                  </button>
                </div>
              </div>
              <div className="p-4 max-h-48 overflow-y-auto font-mono text-xs text-neutral-300 space-y-1">
                {logs.length === 0 ? (
                  <span className="text-neutral-600">No logs yet.</span>
                ) : (
                  logs.map((line, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-neutral-600 select-none w-6 text-right shrink-0">{i + 1}</span>
                      <span className="text-neutral-300 leading-relaxed">{line}</span>
                    </div>
                  ))
                )}
                {detail?.error && (
                  <div className="mt-2 text-red-400 border-t border-neutral-800 pt-2">✕ {detail.error}</div>
                )}
              </div>
              <div className="px-4 py-2 border-t border-neutral-800 flex gap-6 flex-wrap">
                {[
                  ['Started',      fmt(view.startedAt   ?? null)],
                  ['Completed',    fmt(view.completedAt ?? null)],
                  ['Duration',     fmtDuration(view.durationMs)],
                  ['Pipeline',     pipelineLabel(view.pipeline)],
                  ['Triggered by', triggeredLabel],
                  ['Outputs',      `${graphCount} graphs · ${signalCount} signals · ${outputs.storyId ? 'story ✓' : 'no story'}`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-600">{k}</div>
                    <div className="font-mono text-[11px] text-neutral-400">{v}</div>
                  </div>
                ))}
                {view.sessionTelemetryStatus && (
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-600">Telemetry</div>
                    <div className="mt-0.5">
                      <TelemetryBadge status={view.sessionTelemetryStatus} />
                    </div>
                    {view.sessionTelemetryError && (
                      <div className="font-mono text-[10px] text-red-400 mt-0.5 max-w-xs truncate" title={view.sessionTelemetryError}>
                        {view.sessionTelemetryError}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── RunsPanel ─────────────────────────────────────────────────────────────────

export function RunsPanel({ getToken }: { getToken: TokenFactory }) {
  const [runs, setRuns]           = useState<StoryRun[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [statusFilter, setStatus] = useState<RunStatus | ''>('');
  const [loading, setLoading]     = useState(false);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await getToken();
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`${API}/api/admin/runs?${params}`, {
        headers: { Authorization: `Bearer ${t ?? ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function triggerRun(sessionKey: string, pipeline: RunPipeline, storyId?: string) {
    const t = await getToken();
    const res = await fetch(`${API}/api/admin/runs`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${t ?? ''}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sessionKey, pipeline, storyId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Server error');
    }
    await load();
  }

  async function deleteRun(id: string) {
    if (!confirm('Are you sure you want to delete this run?')) return;
    try {
      const t = await getToken();
      const res = await fetch(`${API}/api/admin/runs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t ?? ''}` },
      });
      if (!res.ok) {
        throw new Error('Failed to delete run');
      }
      await load();
    } catch (err: any) {
      alert(err.message);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => { setStatus(e.target.value as RunStatus | ''); setPage(1); }}
            className="border border-neutral-200 px-3 py-1.5 font-mono text-xs text-neutral-700 focus:outline-none focus:border-neutral-400 bg-white"
          >
            <option value="">All statuses</option>
            <option value="queued">Queued</option>
            <option value="running">Running</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
          </select>
          <button onClick={load} disabled={loading}
            className="p-1.5 border border-neutral-200 text-neutral-400 hover:text-neutral-700 hover:border-neutral-300 transition-colors disabled:opacity-40">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-1.5 font-mono text-xs uppercase tracking-widest hover:bg-f1-red transition-colors">
          <Play size={12} /> Trigger Run
        </button>
      </div>

      <div className="border border-neutral-200">
        <div className="flex items-center gap-4 px-6 py-2.5 bg-neutral-50 border-b border-neutral-200">
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 w-16 shrink-0">ID</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 w-24 shrink-0">Session</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 w-20 shrink-0 hidden md:block">Telemetry</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 flex-1 hidden sm:block">Pipeline</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 w-24 shrink-0">Status</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 w-16 text-right shrink-0 hidden lg:block">Duration</span>
          <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 w-32 text-right shrink-0 hidden md:block">Created</span>
          <span className="w-4 shrink-0" />
        </div>
        {loading && runs.length === 0 ? (
          <div className="py-16 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-neutral-300" /></div>
        ) : runs.length === 0 ? (
          <div className="py-16 text-center font-mono text-sm text-neutral-400">No runs found.</div>
        ) : (
          runs.map(run => <RunRow key={run._id} run={run} getToken={getToken} onDelete={deleteRun} />)
        )}
      </div>

      {total > 15 && (
        <div className="flex items-center justify-between mt-4">
          <span className="font-mono text-[11px] text-neutral-400">{total} total</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 border border-neutral-200 font-mono text-xs text-neutral-600 disabled:opacity-30 hover:border-neutral-400 transition-colors">
              ← Prev
            </button>
            <button disabled={page * 15 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 border border-neutral-200 font-mono text-xs text-neutral-600 disabled:opacity-30 hover:border-neutral-400 transition-colors">
              Next →
            </button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <TriggerRunModal onClose={() => setShowModal(false)} onTrigger={triggerRun} />
        )}
      </AnimatePresence>
    </div>
  );
}
