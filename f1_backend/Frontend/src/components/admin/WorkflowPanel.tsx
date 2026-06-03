import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Loader2, Terminal, Radio, ChevronDown, ChevronUp,
  AlertCircle, CheckCircle, BarChart2, BookOpen, Zap, Lightbulb, Check,
} from 'lucide-react';
import { PipelineDAG } from './PipelineDAG';
import { GraphSimulator } from './GraphSimulator';
import { API, statusColor, StatusIcon, PRIORITY_COLOR } from './shared';
import type { StoryRun, TelemetrySession, RunPipeline } from './types';
import type { GraphSpec, Signal } from '../../types';
import { signalsApi, graphsApi, anglesApi, type AnalysisAngle } from '../../config/api';

// ── Signal card ───────────────────────────────────────────────────────────────

function SignalCard({ sig }: { sig: Signal }) {
  return (
    <div className={`border p-3 space-y-1 ${PRIORITY_COLOR[sig.priority] ?? PRIORITY_COLOR.low}`}>
      <div className="flex items-center gap-2">
        <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLOR[sig.priority] ?? PRIORITY_COLOR.low}`}>
          {sig.priority}
        </span>
        <span className="font-mono text-[10px] text-neutral-400">Lap {sig.lap} · {sig.location}</span>
      </div>
      <p className="font-mono text-xs text-neutral-200 font-medium">{sig.title}</p>
      <p className="font-mono text-[10px] text-neutral-400 leading-relaxed">{sig.implication}</p>
    </div>
  );
}

// ── Initiation form ───────────────────────────────────────────────────────────

type ScopeOpt = 'session' | 'driver' | 'team';

interface InitFormProps {
  sessions:  TelemetrySession[];
  loading:   boolean;
  onLaunch:  (sessionKey: string, angle: string, pipeline: RunPipeline, scopes: ScopeOpt[]) => void;
  launching: boolean;
}

function InitForm({ sessions, loading, onLaunch, launching }: InitFormProps) {
  const [session,  setSession]  = useState('');
  const [angle,    setAngle]    = useState('');
  const [pipeline, setPipeline] = useState<RunPipeline>('full');
  const [scopes, setScopes]     = useState<Set<ScopeOpt>>(new Set(['session', 'driver', 'team']));
  const [err,      setErr]      = useState('');

  function toggleScope(s: ScopeOpt) {
    setScopes(prev => {
      const next = new Set(prev);
      if (next.has(s)) {
        next.delete(s);
      } else {
        next.add(s);
      }
      return next;
    });
  }

  const grouped = {
    done:      sessions.filter(s => s.telemetryStatus === 'done'),
    enriching: sessions.filter(s => s.telemetryStatus === 'pending' || s.telemetryStatus === 'processing'),
    failed:    sessions.filter(s => s.telemetryStatus === 'failed'),
  };

  useEffect(() => {
    if (session) return;
    const first = grouped.done[0];
    if (first) setSession(first.sessionKey);
  }, [grouped.done, session]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) { setErr('Select a session'); return; }
    const ready = grouped.done.some(s => s.sessionKey === session);
    if (!ready) { setErr('Selected session is not fully enriched yet'); return; }
    setErr('');
    onLaunch(session, angle, pipeline, Array.from(scopes));
  }

  return (
    <div className="border border-neutral-700 bg-neutral-900/60">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-neutral-700">
        <Zap size={14} className="text-f1-red" />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-300 font-bold">
          Launch AI Pipeline
        </span>
      </div>

      <form onSubmit={submit} className="p-5 space-y-4">
        {/* Session selector */}
        <div>
          <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 block mb-1.5">
            Race Session
          </label>
          {loading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 size={12} className="animate-spin text-neutral-500" />
              <span className="font-mono text-xs text-neutral-500">Loading sessions…</span>
            </div>
          ) : sessions.length === 0 ? (
            <p className="font-mono text-[11px] text-amber-400 border border-amber-700 bg-amber-950/30 px-3 py-2">
              No ingested sessions. Use the Ingest tab first.
            </p>
          ) : (
            <>
              <select
                value={session}
                onChange={e => setSession(e.target.value)}
                className="w-full border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-200 focus:outline-none focus:border-f1-red transition-colors"
              >
                <option value="">— Select session —</option>
                {grouped.done.length > 0 && (
                  <optgroup label={`Ready (${grouped.done.length})`}>
                    {grouped.done.map(s => (
                      <option key={s.sessionKey} value={s.sessionKey}>
                        {s.sessionName} · {s.circuitName} {s.year} ({s.sessionKey})
                      </option>
                    ))}
                  </optgroup>
                )}
                {grouped.enriching.length > 0 && (
                  <optgroup label={`Enriching (${grouped.enriching.length})`}>
                    {grouped.enriching.map(s => (
                      <option key={s.sessionKey} value={s.sessionKey} disabled>
                        {s.sessionName} · {s.circuitName} {s.year} · [{s.telemetryStatus}]
                      </option>
                    ))}
                  </optgroup>
                )}
                {grouped.failed.length > 0 && (
                  <optgroup label={`Failed (${grouped.failed.length})`}>
                    {grouped.failed.map(s => (
                      <option key={s.sessionKey} value={s.sessionKey} disabled>
                        {s.sessionName} · {s.circuitName} {s.year} · [failed]
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p className="font-mono text-[10px] text-neutral-500 mt-1">
                {grouped.done.length} ready
                {grouped.enriching.length > 0 && ` · ${grouped.enriching.length} enriching`}
                {grouped.failed.length > 0 && ` · ${grouped.failed.length} failed`}
              </p>
            </>
          )}
        </div>

        {/* Story angle */}
        <div>
          <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 block mb-1.5">
            Story Angle <span className="text-neutral-600">(optional)</span>
          </label>
          <textarea
            value={angle}
            onChange={e => setAngle(e.target.value)}
            rows={2}
            placeholder="e.g. Hamilton tire degradation in Sector 2 laps 35–55"
            className="w-full border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-200 focus:outline-none focus:border-f1-red resize-none transition-colors placeholder:text-neutral-600"
          />
        </div>

        {/* Pipeline selector */}
        <div>
          <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 block mb-1.5">
            Pipeline
          </label>
          <div className="flex gap-2">
            {([
              ['full',               'Full Pipeline'],
              ['langraph_telemetry', 'Telemetry Only'],
              ['crew_story',         'Story Only'],
            ] as [RunPipeline, string][]).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setPipeline(val)}
                className={`flex-1 py-2 font-mono text-[10px] uppercase tracking-widest border transition-colors ${
                  pipeline === val
                    ? 'border-f1-red bg-f1-red/10 text-white'
                    : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Scope checkboxes — only meaningful for pipelines that run the story crew */}
        {(pipeline === 'full' || pipeline === 'crew_story') && (
          <div>
            <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 block mb-1.5">
              Story Scopes
            </label>
            <div className="flex gap-2">
              {([
                ['session', 'Session'],
                ['driver',  'Per Driver'],
                ['team',    'Per Team'],
              ] as [ScopeOpt, string][]).map(([val, label]) => {
                const active = scopes.has(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => toggleScope(val)}
                    className={`flex-1 py-2 font-mono text-[10px] uppercase tracking-widest border transition-colors ${
                      active
                        ? 'border-emerald-700 bg-emerald-950/20 text-emerald-300'
                        : 'border-neutral-700 text-neutral-500 hover:border-neutral-500'
                    }`}
                  >
                    {active ? '✓ ' : ''}{label}
                  </button>
                );
              })}
            </div>
            <p className="font-mono text-[9px] text-neutral-600 mt-1">
              Step 1 discovers interesting angles per driver/team. You review them, then generate one story per selected angle.
            </p>
          </div>
        )}

        {err && (
          <p className="flex items-center gap-1.5 font-mono text-[10px] text-red-400">
            <AlertCircle size={10} /> {err}
          </p>
        )}

        <button
          type="submit"
          disabled={launching || !session}
          className="w-full flex items-center justify-center gap-2 bg-f1-red text-white py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {launching ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          {launching
            ? 'Launching…'
            : (pipeline === 'full' || pipeline === 'crew_story') ? 'Discover Angles' : 'Launch Pipeline'}
        </button>
      </form>
    </div>
  );
}

// ── Run monitor ───────────────────────────────────────────────────────────────

type TokenFactory = () => Promise<string | null>;

interface RunMonitorProps {
  run:      StoryRun;
  getToken: TokenFactory;
  onDone:   (run: StoryRun) => void;
}

function RunMonitor({ run: initialRun, getToken, onDone }: RunMonitorProps) {
  const [run, setRun]           = useState<StoryRun>(initialRun);
  const [logsOpen, setLogsOpen] = useState(true);
  const intervalRef             = useRef<ReturnType<typeof setInterval> | null>(null);
  const logEndRef               = useRef<HTMLDivElement | null>(null);

  const poll = useCallback(async () => {
    try {
      const t = await getToken();
      const res = await fetch(`${API}/api/admin/runs/${initialRun._id}`, {
        headers: { Authorization: `Bearer ${t ?? ''}` },
      });
      if (!res.ok) return;
      const data: StoryRun = await res.json();
      setRun(data);
      if (data.status === 'done' || data.status === 'failed') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (data.status === 'done') onDone(data);
      }
    } catch { /* ignore */ }
  }, [initialRun._id, getToken, onDone]);

  useEffect(() => {
    if (run.status === 'queued' || run.status === 'running') {
      poll();
      intervalRef.current = setInterval(poll, 3000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [run.logs.length]);

  const isActive = run.status === 'queued' || run.status === 'running';

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-3 border border-neutral-700 bg-neutral-900/60">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border font-mono text-[10px] uppercase tracking-wider ${statusColor(run.status)}`}>
          <StatusIcon status={run.status} />
          {run.status}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">
          Session: {run.sessionKey}
        </span>
        {isActive && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-amber-400 ml-auto">
            <Radio size={10} className="animate-pulse" /> Live
          </span>
        )}
        {run.status === 'done' && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400 ml-auto">
            <CheckCircle size={10} /> Complete
          </span>
        )}
        {run.status === 'failed' && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-red-400 ml-auto">
            <AlertCircle size={10} /> Failed
          </span>
        )}
      </div>

      {/* DAG */}
      <div className="border border-neutral-700 bg-neutral-900/40 p-4">
        <PipelineDAG pipeline={run.pipeline} overallStatus={run.status} logs={run.logs} />
      </div>

      {/* Log stream */}
      <div className="border border-neutral-800 bg-neutral-950">
        <button
          onClick={() => setLogsOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 border-b border-neutral-800 text-left"
        >
          <div className="flex items-center gap-2">
            <Terminal size={12} className="text-neutral-500" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Run Logs
            </span>
            <span className="font-mono text-[9px] text-neutral-600">({run.logs.length} lines)</span>
          </div>
          {logsOpen ? <ChevronUp size={13} className="text-neutral-600" /> : <ChevronDown size={13} className="text-neutral-600" />}
        </button>

        <AnimatePresence>
          {logsOpen && (
            <motion.div
              initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="p-4 max-h-56 overflow-y-auto font-mono text-xs text-neutral-300 space-y-1">
                {run.logs.length === 0 ? (
                  <span className="text-neutral-600">No logs yet.</span>
                ) : (
                  run.logs.map((line, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-neutral-600 select-none w-6 text-right shrink-0">{i + 1}</span>
                      <span className="leading-relaxed break-all">{line}</span>
                    </div>
                  ))
                )}
                {run.error && (
                  <div className="mt-2 text-red-400 border-t border-neutral-800 pt-2">✕ {run.error}</div>
                )}
                <div ref={logEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Angle review ──────────────────────────────────────────────────────────────

interface AnglesReviewProps {
  angles:     AnalysisAngle[];
  selected:   Set<string>;
  loading:    boolean;
  generating: boolean;
  onToggle:   (id: string) => void;
  onSetAll:   (select: boolean) => void;
  onGenerate: () => void;
}

function AngleCard({ angle, checked, onToggle }: { angle: AnalysisAngle; checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left border p-3 space-y-1.5 transition-colors ${
        checked
          ? 'border-emerald-700 bg-emerald-950/20'
          : 'border-neutral-700 bg-neutral-800/30 hover:border-neutral-500'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`flex items-center justify-center w-4 h-4 border shrink-0 ${
          checked ? 'bg-emerald-600 border-emerald-600' : 'border-neutral-600'
        }`}>
          {checked && <Check size={11} className="text-white" />}
        </span>
        <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLOR[angle.priority] ?? PRIORITY_COLOR.low}`}>
          {angle.priority}
        </span>
        <span className="font-mono text-xs text-neutral-100 font-medium flex-1">{angle.title}</span>
      </div>
      <p className="font-mono text-[10px] text-neutral-300 leading-relaxed pl-6">{angle.focus}</p>
      {angle.rationale && (
        <p className="font-mono text-[10px] text-neutral-500 leading-relaxed pl-6 italic">{angle.rationale}</p>
      )}
      {angle.supportingSignalIds.length > 0 && (
        <p className="font-mono text-[9px] text-neutral-600 pl-6">
          {angle.supportingSignalIds.length} supporting signal{angle.supportingSignalIds.length === 1 ? '' : 's'}
        </p>
      )}
    </button>
  );
}

function AnglesReview({ angles, selected, loading, generating, onToggle, onSetAll, onGenerate }: AnglesReviewProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <Loader2 size={16} className="animate-spin text-neutral-500" />
        <span className="font-mono text-xs text-neutral-500">Loading discovered angles…</span>
      </div>
    );
  }

  if (angles.length === 0) {
    return (
      <p className="font-mono text-xs text-neutral-500 text-center py-8">
        No angles were discovered. Ensure the session has telemetry signals, then re-run discovery.
      </p>
    );
  }

  // Group by scope: one section per driver / per team.
  const groups = new Map<string, { label: string; angles: AnalysisAngle[] }>();
  for (const a of angles) {
    const key = a.scopeKind === 'driver' ? `d:${a.driverNumber}` : `t:${a.teamId}`;
    const label = a.scopeKind === 'driver'
      ? `Driver #${a.driverNumber}`
      : (a.teamName ?? a.teamId ?? 'Team');
    if (!groups.has(key)) groups.set(key, { label, angles: [] });
    groups.get(key)!.angles.push(a);
  }

  const selectedCount = angles.filter(a => selected.has(a.id)).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-3 border border-neutral-700 bg-neutral-900/60">
        <Lightbulb size={14} className="text-amber-400" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300 font-bold">
          {angles.length} angles · {selectedCount} selected
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onSetAll(true)}
            className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 border border-neutral-700 px-2 py-1 hover:border-neutral-500"
          >
            Select all
          </button>
          <button
            onClick={() => onSetAll(false)}
            className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 border border-neutral-700 px-2 py-1 hover:border-neutral-500"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Grouped angle cards */}
      <div className="space-y-5">
        {[...groups.values()].map(group => (
          <div key={group.label}>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mb-2">{group.label}</p>
            <div className="space-y-2">
              {group.angles.map(a => (
                <AngleCard key={a.id} angle={a} checked={selected.has(a.id)} onToggle={() => onToggle(a.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Generate */}
      <button
        onClick={onGenerate}
        disabled={generating || selectedCount === 0}
        className="w-full flex items-center justify-center gap-2 bg-f1-red text-white py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        {generating ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
        {generating ? 'Launching…' : `Generate Stories from ${selectedCount} selected`}
      </button>
    </div>
  );
}

// ── WorkflowPanel ─────────────────────────────────────────────────────────────

export function WorkflowPanel({ getToken }: { getToken: TokenFactory }) {
  const [sessions, setSessions]     = useState<TelemetrySession[]>([]);
  const [sessionsLoading, setSlLoading] = useState(false);
  const [activeRun, setActiveRun]   = useState<StoryRun | null>(null);
  const [launching, setLaunching]   = useState(false);
  const [signals, setSignals]       = useState<Signal[]>([]);
  const [graphs, setGraphs]         = useState<GraphSpec[]>([]);
  const [resultsLoading, setResLoading] = useState(false);
  const [activeSection, setSection] = useState<'dag' | 'results' | 'simulator'>('dag');

  // Angle review (two-step story pipeline)
  const [angles, setAngles]         = useState<AnalysisAngle[]>([]);
  const [anglesLoading, setAnglesLoading] = useState(false);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const launchParams = useRef<{ sessionKey: string; pipeline: RunPipeline; scopes: ScopeOpt[] } | null>(null);

  useEffect(() => {
    setSlLoading(true);
    fetch(`${API}/api/telemetry/sessions`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then((d: { sessions: TelemetrySession[] }) => setSessions(d.sessions ?? []))
      .finally(() => setSlLoading(false));
  }, []);

  async function postRun(body: Record<string, unknown>): Promise<StoryRun> {
    const t = await getToken();
    const res = await fetch(`${API}/api/admin/runs`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${t ?? ''}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Launch failed');
    return res.json();
  }

  async function handleLaunch(sessionKey: string, angle: string, pipeline: RunPipeline, scopes: ScopeOpt[]) {
    setLaunching(true);
    setSignals([]);
    setGraphs([]);
    setAngles([]);
    setSelected(new Set());
    setSection('dag');
    const isStory = pipeline === 'full' || pipeline === 'crew_story';
    launchParams.current = { sessionKey, pipeline, scopes };
    try {
      const run = await postRun({
        sessionKey, pipeline, context: angle || undefined, scopes,
        stage: isStory ? 'angles' : undefined,
      });
      setActiveRun(run);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  }

  const handleRunDone = useCallback(async (completedRun: StoryRun) => {
    setActiveRun(completedRun);
    // Stage A (angle discovery) → load angles for review, do NOT fetch story results.
    if (completedRun.stage === 'angles') {
      setAnglesLoading(true);
      try {
        const res = await anglesApi(getToken).list({ sessionKey: completedRun.sessionKey });
        const list = res.angles ?? [];
        setAngles(list);
        // Pre-select everything not already rejected/generated.
        setSelected(new Set(list.filter(a => a.status !== 'rejected' && a.status !== 'generated').map(a => a.id)));
      } catch { /* silent */ } finally {
        setAnglesLoading(false);
      }
      return;
    }
    // Stage C (or telemetry-only) → fetch signals + graphs.
    setResLoading(true);
    try {
      const [sigRes, grRes] = await Promise.all([
        signalsApi(getToken).list(completedRun.sessionKey),
        graphsApi(getToken).list({ sessionKey: completedRun.sessionKey }),
      ]);
      setSignals((sigRes as { signals: Signal[] }).signals ?? []);
      setGraphs((grRes as { graphs: GraphSpec[] }).graphs ?? []);
    } catch { /* silent */ } finally {
      setResLoading(false);
    }
    setSection('results');
  }, [getToken]);

  function toggleAngle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function setAllAngles(select: boolean) {
    setSelected(select ? new Set(angles.map(a => a.id)) : new Set());
  }

  async function handleGenerate() {
    const params = launchParams.current;
    if (!params) return;
    setGenerating(true);
    try {
      const selectedIds = angles.filter(a => selected.has(a.id)).map(a => a.id);
      const rejectedIds = angles.filter(a => !selected.has(a.id)).map(a => a.id);
      const api = anglesApi(getToken);
      await Promise.all([
        selectedIds.length ? api.bulkSelect(selectedIds, 'selected') : Promise.resolve(),
        rejectedIds.length ? api.bulkSelect(rejectedIds, 'rejected') : Promise.resolve(),
      ]);
      setSignals([]);
      setGraphs([]);
      setSection('dag');
      const run = await postRun({
        sessionKey: params.sessionKey, pipeline: params.pipeline, scopes: params.scopes, stage: 'stories',
      });
      setActiveRun(run);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Story generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const hasResults = signals.length > 0 || graphs.length > 0;
  const runDone = activeRun?.status === 'done';
  const isAngleStage = activeRun?.stage === 'angles';

  return (
    <div className="space-y-6">
      {/* Initiation form */}
      <InitForm
        sessions={sessions}
        loading={sessionsLoading}
        onLaunch={handleLaunch}
        launching={launching}
      />

      {/* Active run monitor */}
      {activeRun && (
        <div>
          {/* Section tabs — only for the story/telemetry results view */}
          {runDone && !isAngleStage && (
            <div className="flex border-b border-neutral-700 mb-4">
              {([
                ['dag',       'Pipeline',      BarChart2 ],
                ['results',   'Results',       CheckCircle],
                ['simulator', 'Graph Sim',     Zap       ],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setSection(id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest border-b-2 -mb-px transition-colors ${
                    activeSection === id
                      ? 'border-f1-red text-white'
                      : 'border-transparent text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Icon size={11} />
                  {label}
                  {id === 'results' && hasResults && (
                    <span className="ml-0.5 font-mono text-[8px] bg-f1-red text-white px-1 py-0.5 rounded-sm">
                      {signals.length + graphs.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Run monitor (DAG + logs) always visible while running or for the angle stage */}
          {(!runDone || isAngleStage) && (
            <RunMonitor key={activeRun._id} run={activeRun} getToken={getToken} onDone={handleRunDone} />
          )}

          {/* Angle review appears after a discovery run completes */}
          {runDone && isAngleStage && (
            <div className="mt-4">
              <AnglesReview
                angles={angles}
                selected={selected}
                loading={anglesLoading}
                generating={generating}
                onToggle={toggleAngle}
                onSetAll={setAllAngles}
                onGenerate={handleGenerate}
              />
            </div>
          )}

          <AnimatePresence mode="wait">
            {!isAngleStage && activeSection === 'dag' && runDone && (
              <motion.div key="dag" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <RunMonitor key={activeRun._id} run={activeRun} getToken={getToken} onDone={handleRunDone} />
              </motion.div>
            )}

            {!isAngleStage && activeSection === 'results' && runDone && (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="space-y-5">
                {resultsLoading && (
                  <div className="flex items-center gap-2 py-8 justify-center">
                    <Loader2 size={16} className="animate-spin text-neutral-500" />
                    <span className="font-mono text-xs text-neutral-500">Fetching results…</span>
                  </div>
                )}

                {/* Signals */}
                {signals.length > 0 && (
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mb-3 flex items-center gap-2">
                      <AlertCircle size={11} /> Signals Detected ({signals.length})
                    </p>
                    <div className="space-y-2">
                      {signals.map(sig => <SignalCard key={sig.id} sig={sig} />)}
                    </div>
                  </div>
                )}

                {/* Graphs summary */}
                {graphs.length > 0 && (
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mb-3 flex items-center gap-2">
                      <BarChart2 size={11} /> Graphs Generated ({graphs.length})
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {graphs.map(g => (
                        <div key={g.id} className="flex items-center gap-2 border border-neutral-700 bg-neutral-800/40 px-3 py-2">
                          <span className="font-mono text-[9px] uppercase bg-neutral-700 text-neutral-400 px-1.5 py-0.5">{g.type}</span>
                          <span className="font-mono text-[10px] text-neutral-300 truncate">{g.title ?? 'Untitled'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Story link */}
                {activeRun.outputRef?.storyId && (
                  <div className="flex items-center gap-3 border border-emerald-800 bg-emerald-950/20 px-4 py-3">
                    <BookOpen size={14} className="text-emerald-500 shrink-0" />
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-widest text-emerald-600">Story Created</p>
                      <p className="font-mono text-xs text-neutral-300">ID: {activeRun.outputRef.storyId}</p>
                    </div>
                  </div>
                )}

                {!resultsLoading && !hasResults && (
                  <p className="font-mono text-xs text-neutral-500 text-center py-8">
                    No signals or graphs were produced by this run.
                  </p>
                )}
              </motion.div>
            )}

            {activeSection === 'simulator' && runDone && (
              <motion.div key="simulator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <GraphSimulator graphs={graphs} getToken={getToken} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Placeholder when no run active */}
      {!activeRun && !launching && (
        <div className="flex flex-col items-center justify-center py-16 border border-dashed border-neutral-800">
          <Play size={28} className="text-neutral-700 mb-3" />
          <p className="font-mono text-xs text-neutral-600">
            Select a session and launch a pipeline to get started.
          </p>
        </div>
      )}
    </div>
  );
}
