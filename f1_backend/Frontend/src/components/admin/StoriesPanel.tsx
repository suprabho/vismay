import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2, RefreshCw, Plus, ChevronRight, Eye, Save, Sparkles,
  ArrowUp, ArrowDown, Trash2, BookOpen, PenLine, CheckCircle, Lightbulb, RotateCcw,
} from 'lucide-react';
import { StoryRenderer } from '../StoryRenderer';
import { AngleReview } from './AngleReview';
import { API, pollAngleStory } from './shared';
import { storiesApi, graphsApi, anglesApi, type AnalysisAngle, type AngleScopeKind, type AngleStatus } from '../../config/api';
import type { Story, StoryContentBlock, GraphSpec } from '../../types';
import type { TelemetrySession } from './types';

type TokenFactory = () => Promise<string | null>;

const CATEGORIES = ['Strategy', 'Technical', 'Driver Analysis', 'Innovation', 'Race Report'];
const BLOCK_TYPES: StoryContentBlock['type'][] = ['paragraph', 'heading', 'quote', 'stat', 'graph_embed'];

function storyStatusStyle(status: Story['status']) {
  switch (status) {
    case 'draft':     return 'text-neutral-500 bg-neutral-100 border-neutral-200';
    case 'published': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'archived':  return 'text-neutral-300 bg-neutral-50 border-neutral-100';
  }
}

// ── Graph Data Editor ─────────────────────────────────────────────────────────

function GraphDataEditor({
  graph, onSave, getToken,
}: {
  graph:    GraphSpec;
  onSave:   (updated: GraphSpec) => void;
  getToken: TokenFactory;
}) {
  const [points, setPoints] = useState<Record<string, unknown>[]>(graph.dataPoints);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const api = graphsApi(getToken);
  const xKey = graph.xAxis?.key ?? 'lap';
  const columns = graph.series.map(s => s.dataKey);
  const allCols = [xKey, ...columns.filter(c => c !== xKey)];

  function updateCell(rowIdx: number, col: string, val: string) {
    setPoints(prev => prev.map((row, i) =>
      i === rowIdx ? { ...row, [col]: isNaN(Number(val)) ? val : Number(val) } : row,
    ));
  }

  function addRow() {
    setPoints(prev => [...prev, { [xKey]: (prev.length + 1) }]);
  }

  function removeRow(i: number) {
    setPoints(prev => prev.filter((_, idx) => idx !== i));
  }

  async function save() {
    setSaving(true); setSaveError(null);
    try {
      const updated = await api.update(graph.id, { dataPoints: points }) as GraphSpec;
      onSave({ ...graph, ...updated, dataPoints: points });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-neutral-200 bg-white">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-200 bg-neutral-50">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500">{graph.title ?? 'Graph Data'}</span>
          <span className="font-mono text-[8px] bg-neutral-200 text-neutral-500 px-1.5 py-0.5 uppercase">{graph.type}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={addRow}
            className="flex items-center gap-1 font-mono text-[10px] text-neutral-500 hover:text-neutral-900 transition-colors">
            <Plus size={11} /> Row
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 font-mono text-[10px] bg-neutral-900 text-white px-2.5 py-1 hover:bg-neutral-700 transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
            Save
          </button>
        </div>
      </div>
      {saveError && (
        <div className="px-4 py-2 font-mono text-[10px] text-red-600 bg-red-50 border-b border-red-200">{saveError}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-neutral-200">
              {allCols.map(col => (
                <th key={col} className="px-3 py-2 text-left text-[9px] uppercase tracking-widest text-neutral-400 font-normal">{col}</th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {points.map((row, i) => (
              <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                {allCols.map(col => (
                  <td key={col} className="px-2 py-1">
                    <input
                      type="text"
                      value={String(row[col] ?? '')}
                      onChange={e => updateCell(i, col, e.target.value)}
                      className="w-full bg-transparent text-neutral-700 focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#E10600] px-1 py-0.5 text-xs"
                    />
                  </td>
                ))}
                <td className="px-1">
                  <button onClick={() => removeRow(i)}
                    className="text-neutral-300 hover:text-red-500 transition-colors">
                    <Trash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {points.length === 0 && (
          <p className="font-mono text-[11px] text-neutral-400 text-center py-6">No data points. Click + Row to add.</p>
        )}
      </div>
    </div>
  );
}

// Graph API responses carry `_id` (no `id` virtual on the GraphSpec model),
// but the editor matches embeds, keys options, and saves by `id`.
function withId(g: GraphSpec & { _id?: string }): GraphSpec {
  return g.id ? g : { ...g, id: g._id ?? '' };
}

// ── Story Editor ──────────────────────────────────────────────────────────────

function StoryEditor({
  story: initialStory, getToken, onBack, onUpdate,
}: {
  story:    Story;
  getToken: TokenFactory;
  onBack:   () => void;
  onUpdate: (s: Story) => void;
}) {
  const [story, setStory]       = useState<Story>(initialStory);
  const [blocks, setBlocks]     = useState<StoryContentBlock[]>(initialStory.content ?? []);
  const [graphs, setGraphs]     = useState<GraphSpec[]>([]);
  const [editIdx, setEditIdx]   = useState<number | null>(null);
  const [saving, setSaving]     = useState(false);
  const [publishing, setPublish]= useState(false);
  const [view, setView]         = useState<'editor' | 'preview'>('editor');
  const [addingGraph, setAddGraph] = useState(false);
  const [newGraphType, setNGType]  = useState<GraphSpec['type']>('projection');
  const [newGraphTitle, setNGTitle]= useState('');

  const stApi = storiesApi(getToken);
  const gApi  = graphsApi(getToken);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const byStory = await gApi.list({ storyId: story.id })
        .then(r => ((r as { graphs: GraphSpec[] }).graphs ?? []).map(withId))
        .catch(() => [] as GraphSpec[]);
      // Scoped (driver/team) graphs are linked to the session story, not this one,
      // so also resolve the graphs referenced by graph_embed blocks directly.
      const embeddedIds = [...new Set(
        (story.content ?? [])
          .filter(b => b.type === 'graph_embed' && b.graphId)
          .map(b => b.graphId as string),
      )];
      const have = new Set(byStory.map(g => g.id));
      const extra = await Promise.all(
        embeddedIds
          .filter(id => !have.has(id))
          .map(id => gApi.get(id).then(g => withId(g as GraphSpec)).catch(() => null)),
      );
      if (cancelled) return;
      setGraphs([...byStory, ...extra.filter((g): g is GraphSpec => !!g)]);
    })();
    return () => { cancelled = true; };
  }, [story.id]);

  function moveBlock(idx: number, dir: -1 | 1) {
    const next = [...blocks];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    setBlocks(next);
  }

  function updateBlock(idx: number, patch: Partial<StoryContentBlock>) {
    setBlocks(prev => prev.map((b, i) => i === idx ? { ...b, ...patch } : b));
  }

  function addBlock(type: StoryContentBlock['type']) {
    setBlocks(prev => [...prev, { type, text: '' }]);
    setEditIdx(blocks.length);
  }

  function removeBlock(idx: number) {
    setBlocks(prev => prev.filter((_, i) => i !== idx));
    setEditIdx(null);
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const updated = await stApi.update(story.id, {
        content: blocks, title: story.title, summary: story.summary, category: story.category,
      }) as Story;
      setStory(updated); onUpdate(updated);
    } catch { /* silent */ }
    setSaving(false);
  }

  async function publish() {
    if (!story.id) return;
    setPublish(true);
    try {
      await stApi.publish(story.id);
      const updated = { ...story, status: 'published' as const };
      setStory(updated); onUpdate(updated);
    } catch { /* silent */ }
    setPublish(false);
  }

  async function createGraph() {
    if (!newGraphTitle.trim()) return;
    const created = withId(await gApi.create({
      type: newGraphType, title: newGraphTitle, storyId: story.id, series: [], dataPoints: [],
    }) as GraphSpec);
    setGraphs(prev => [...prev, created]);
    setAddGraph(false); setNGTitle('');
  }

  const previewBlocks = blocks.map(b => {
    if (b.type === 'graph_embed' && b.graphId) {
      const g = graphs.find(g => g.id === b.graphId);
      return g ? { ...b, graphSpec: g } : b;
    }
    return b;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack}
          className="flex items-center gap-1.5 font-mono text-xs text-neutral-400 hover:text-neutral-900 transition-colors">
          ← Back to stories
        </button>
        <div className="flex items-center gap-2">
          <button onClick={() => setView(v => v === 'editor' ? 'preview' : 'editor')}
            className="flex items-center gap-1.5 font-mono text-xs border border-neutral-200 px-3 py-1.5 text-neutral-600 hover:border-neutral-400 transition-colors">
            <Eye size={12} /> {view === 'editor' ? 'Preview' : 'Edit'}
          </button>
          {story.status !== 'published' && (
            <button onClick={publish} disabled={publishing}
              className="flex items-center gap-1.5 font-mono text-xs border border-emerald-300 bg-emerald-50 text-emerald-700 px-3 py-1.5 hover:bg-emerald-100 transition-colors disabled:opacity-50">
              {publishing ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Publish
            </button>
          )}
          <button onClick={saveDraft} disabled={saving}
            className="flex items-center gap-1.5 font-mono text-xs bg-neutral-900 text-white px-3 py-1.5 hover:bg-neutral-700 transition-colors disabled:opacity-50">
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            Save Draft
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          value={story.title}
          onChange={e => setStory(s => ({ ...s, title: e.target.value }))}
          className="flex-1 min-w-[200px] border border-neutral-200 px-3 py-2 font-serif text-lg text-neutral-900 focus:outline-none focus:border-[#E10600]"
          placeholder="Story title"
        />
        <select
          value={story.category}
          onChange={e => setStory(s => ({ ...s, category: e.target.value }))}
          className="border border-neutral-200 px-3 py-2 font-mono text-xs text-neutral-700 focus:outline-none focus:border-[#E10600] bg-white"
        >
          {(CATEGORIES.includes(story.category) ? CATEGORIES : [story.category, ...CATEGORIES])
            .map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className={`flex items-center px-2.5 py-1 border font-mono text-[10px] uppercase tracking-widest ${storyStatusStyle(story.status)}`}>
          {story.status}
        </span>
      </div>
      <input
        value={story.summary}
        onChange={e => setStory(s => ({ ...s, summary: e.target.value }))}
        className="w-full border border-neutral-200 px-3 py-2 font-mono text-xs text-neutral-600 focus:outline-none focus:border-[#E10600]"
        placeholder="Summary (max 500 chars)"
        maxLength={500}
      />

      {view === 'preview' ? (
        <div className="border border-neutral-200 p-8 bg-white">
          <h1 className="font-serif text-3xl font-bold text-neutral-900 mb-6">{story.title}</h1>
          <StoryRenderer blocks={previewBlocks} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {blocks.map((block, idx) => (
              <div key={idx}
                className={`border transition-colors ${editIdx === idx ? 'border-[#E10600] bg-red-50/20' : 'border-neutral-200 bg-white'}`}>
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-neutral-50"
                  onClick={() => setEditIdx(editIdx === idx ? null : idx)}
                >
                  <span className="font-mono text-[9px] uppercase tracking-widest bg-neutral-900 text-white px-1.5 py-0.5">{block.type}</span>
                  <span className="flex-1 font-mono text-xs text-neutral-500 truncate">
                    {block.text?.slice(0, 80) ?? (block.graphId ? `Graph: ${block.graphId}` : '—')}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); moveBlock(idx, -1); }}
                      className="text-neutral-300 hover:text-neutral-700 p-0.5"><ArrowUp size={11} /></button>
                    <button onClick={e => { e.stopPropagation(); moveBlock(idx, 1); }}
                      className="text-neutral-300 hover:text-neutral-700 p-0.5"><ArrowDown size={11} /></button>
                    <button onClick={e => { e.stopPropagation(); removeBlock(idx); }}
                      className="text-neutral-300 hover:text-red-500 p-0.5"><Trash2 size={11} /></button>
                    <ChevronRight size={11} className={`text-neutral-300 transition-transform ${editIdx === idx ? 'rotate-90' : ''}`} />
                  </div>
                </div>

                {editIdx === idx && (
                  <div className="px-3 pb-3 border-t border-neutral-100">
                    {(block.type === 'paragraph' || block.type === 'heading' || block.type === 'quote') && (
                      <textarea
                        value={block.text ?? ''}
                        onChange={e => updateBlock(idx, { text: e.target.value })}
                        rows={block.type === 'paragraph' ? 5 : 2}
                        className="w-full mt-2 border border-neutral-200 px-3 py-2 font-mono text-xs text-neutral-700 focus:outline-none focus:border-[#E10600] resize-y"
                        placeholder={`${block.type} text…`}
                      />
                    )}
                    {block.type === 'stat' && (
                      <div className="flex gap-2 mt-2">
                        <input
                          value={block.meta?.value as string ?? ''}
                          onChange={e => updateBlock(idx, { meta: { ...block.meta, value: e.target.value } })}
                          className="border border-neutral-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#E10600] w-32"
                          placeholder="Value (e.g. 1:23.4)"
                        />
                        <input
                          value={block.text ?? ''}
                          onChange={e => updateBlock(idx, { text: e.target.value })}
                          className="flex-1 border border-neutral-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#E10600]"
                          placeholder="Label (e.g. fastest lap)"
                        />
                      </div>
                    )}
                    {block.type === 'graph_embed' && (
                      <div className="mt-2">
                        <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-400 mb-1 block">Select Graph</label>
                        <select
                          value={block.graphId ?? ''}
                          onChange={e => updateBlock(idx, { graphId: e.target.value })}
                          className="w-full border border-neutral-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#E10600] bg-white"
                        >
                          <option value="">— None —</option>
                          {graphs.map(g => (
                            <option key={g.id} value={g.id}>{g.title ?? g.type} ({g.type})</option>
                          ))}
                        </select>
                        <input
                          value={block.meta?.caption as string ?? ''}
                          onChange={e => updateBlock(idx, { meta: { ...block.meta, caption: e.target.value } })}
                          className="w-full mt-1.5 border border-neutral-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#E10600]"
                          placeholder="Caption (optional)"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            {BLOCK_TYPES.map(t => (
              <button key={t} onClick={() => addBlock(t)}
                className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest border border-dashed border-neutral-300 px-2.5 py-1.5 text-neutral-400 hover:border-neutral-600 hover:text-neutral-700 transition-colors">
                <Plus size={10} /> {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Graph manager */}
      <div className="border-t border-neutral-200 pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">
            Charts &amp; Projections ({graphs.length})
          </h3>
          <button onClick={() => setAddGraph(v => !v)}
            className="flex items-center gap-1.5 font-mono text-[10px] border border-neutral-200 px-2.5 py-1.5 text-neutral-500 hover:border-neutral-500 transition-colors">
            <Plus size={10} /> Add Graph
          </button>
        </div>

        {addingGraph && (
          <div className="flex gap-2 border border-neutral-200 p-3 bg-neutral-50">
            <input
              value={newGraphTitle} onChange={e => setNGTitle(e.target.value)}
              placeholder="Graph title"
              className="flex-1 border border-neutral-200 px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-[#E10600]"
            />
            <select
              value={newGraphType} onChange={e => setNGType(e.target.value as GraphSpec['type'])}
              className="border border-neutral-200 px-2 py-1.5 font-mono text-xs bg-white focus:outline-none focus:border-[#E10600]"
            >
              {(['projection','line','multi_line','bar','bar_grouped','tire_map','annotated_svg'] as GraphSpec['type'][]).map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button onClick={createGraph}
              className="font-mono text-[10px] bg-neutral-900 text-white px-3 py-1.5 hover:bg-neutral-700 transition-colors">
              Create
            </button>
          </div>
        )}

        {graphs.map(g => (
          <details key={g.id} className="group">
            <summary className="flex items-center gap-2 cursor-pointer select-none py-2 px-3 border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 transition-colors list-none">
              <ChevronRight size={11} className="text-neutral-400 group-open:rotate-90 transition-transform" />
              <span className="font-mono text-[9px] uppercase bg-neutral-300 text-neutral-700 px-1.5 py-0.5">{g.type}</span>
              <span className="font-mono text-xs text-neutral-700">{g.title ?? '(untitled)'}</span>
              <span className="font-mono text-[10px] text-neutral-400 ml-auto">{g.dataPoints.length} pts</span>
            </summary>
            <div className="border border-t-0 border-neutral-200">
              <GraphDataEditor
                graph={g} getToken={getToken}
                onSave={updated => setGraphs(prev => prev.map(x => x.id === updated.id ? updated : x))}
              />
            </div>
          </details>
        ))}

        {graphs.length === 0 && (
          <p className="font-mono text-[11px] text-neutral-400 text-center py-4 border border-dashed border-neutral-200">
            No charts yet. Generate with AI or click "Add Graph" to create manually.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Angles Browser (global angle list with filters + per-angle generation) ───

type ScopeFilter  = 'all' | AngleScopeKind;
type StatusFilter = 'all' | AngleStatus;

interface AnglesBrowserProps {
  getToken:       TokenFactory;
  onOpenStoryId:  (storyId: string) => void;
}

function AnglesBrowser({ getToken, onOpenStoryId }: AnglesBrowserProps) {
  const [scope, setScope]               = useState<ScopeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [driverNumber, setDriverNumber] = useState<number | null>(null);
  const [teamId, setTeamId]             = useState<string | null>(null);
  const [sessionKey, setSessionKey]     = useState<string>('');
  const [sessions, setSessions]         = useState<TelemetrySession[]>([]);
  const [angles, setAngles]             = useState<AnalysisAngle[]>([]);
  const [loading, setLoading]           = useState(false);
  const [generatingAngleId, setGeneratingAngleId] = useState<string | null>(null);

  // Load available telemetry sessions for the session-filter dropdown
  useEffect(() => {
    fetch(`${API}/api/telemetry/sessions`)
      .then(r => r.ok ? r.json() : { sessions: [] })
      .then((d: { sessions: TelemetrySession[] }) => setSessions(d.sessions ?? []))
      .catch(() => { /* silent */ });
  }, []);

  // Reset driver/team filter when scope changes
  useEffect(() => {
    if (scope !== 'driver') setDriverNumber(null);
    if (scope !== 'team')   setTeamId(null);
  }, [scope]);

  const fetchAngles = useCallback(async () => {
    setLoading(true);
    try {
      const query: Parameters<ReturnType<typeof anglesApi>['list']>[0] = {};
      if (scope !== 'all')               query.scopeKind = scope;
      if (statusFilter !== 'all')        query.status    = statusFilter;
      if (driverNumber != null)          query.driverNumber = driverNumber;
      if (teamId)                        query.teamId   = teamId;
      if (sessionKey)                    query.sessionKey = sessionKey;
      const res = await anglesApi(getToken).list(query);
      setAngles(res.angles ?? []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [getToken, scope, statusFilter, driverNumber, teamId, sessionKey]);

  useEffect(() => { fetchAngles(); }, [fetchAngles]);

  // Dropdown options derived from the current angle list
  const driverOptions = Array.from(
    new Map(angles.filter(a => a.scopeKind === 'driver' && a.driverNumber != null)
      .map(a => [a.driverNumber!, a])).entries(),
  ).sort(([a], [b]) => a - b);
  const teamOptions = Array.from(
    new Map(angles.filter(a => a.scopeKind === 'team' && a.teamId)
      .map(a => [a.teamId!, a.teamName ?? a.teamId!])).entries(),
  ).sort(([, a], [, b]) => a.localeCompare(b));

  async function handleGenerateAngle(angle: AnalysisAngle) {
    if (!angle.sessionKey) {
      alert('Angle has no sessionKey; cannot generate.');
      return;
    }
    setGeneratingAngleId(angle.id);
    try {
      const t = await getToken();
      const res = await fetch(`${API}/api/admin/runs`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${t ?? ''}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          sessionKey: angle.sessionKey,
          pipeline:   'crew_story',
          scopes:     [angle.scopeKind],
          stage:      'stories',
          angleId:    angle.id,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Server error');
      }
      const newRun: { _id: string } = await res.json();
      const storyId = await pollAngleStory(getToken, newRun._id, angle.id);
      await fetchAngles();
      if (storyId) onOpenStoryId(storyId);
      else alert('Story generation timed out. Check the Runs panel.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Story generation failed');
    } finally {
      setGeneratingAngleId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border border-neutral-200 bg-neutral-50">
        <Lightbulb size={13} className="text-amber-500" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 mr-2">Filters</span>

        <select
          value={scope}
          onChange={e => setScope(e.target.value as ScopeFilter)}
          className="border border-neutral-300 px-2 py-1 font-mono text-[11px] bg-white focus:outline-none focus:border-neutral-500"
        >
          <option value="all">Scope: all</option>
          <option value="driver">Drivers</option>
          <option value="team">Teams</option>
        </select>

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as StatusFilter)}
          className="border border-neutral-300 px-2 py-1 font-mono text-[11px] bg-white focus:outline-none focus:border-neutral-500"
        >
          <option value="all">Status: all</option>
          <option value="proposed">Proposed</option>
          <option value="selected">Selected</option>
          <option value="rejected">Rejected</option>
          <option value="generated">Generated</option>
        </select>

        {scope === 'driver' && driverOptions.length > 0 && (
          <select
            value={driverNumber ?? ''}
            onChange={e => setDriverNumber(e.target.value ? Number(e.target.value) : null)}
            className="border border-neutral-300 px-2 py-1 font-mono text-[11px] bg-white focus:outline-none focus:border-neutral-500"
          >
            <option value="">Driver: any</option>
            {driverOptions.map(([dn, a]) => (
              <option key={dn} value={dn}>
                #{dn} {a.teamName ? `· ${a.teamName}` : ''}
              </option>
            ))}
          </select>
        )}

        {scope === 'team' && teamOptions.length > 0 && (
          <select
            value={teamId ?? ''}
            onChange={e => setTeamId(e.target.value || null)}
            className="border border-neutral-300 px-2 py-1 font-mono text-[11px] bg-white focus:outline-none focus:border-neutral-500"
          >
            <option value="">Team: any</option>
            {teamOptions.map(([tid, tname]) => (
              <option key={tid} value={tid}>{tname}</option>
            ))}
          </select>
        )}

        <select
          value={sessionKey}
          onChange={e => setSessionKey(e.target.value)}
          className="border border-neutral-300 px-2 py-1 font-mono text-[11px] bg-white focus:outline-none focus:border-neutral-500 min-w-[200px]"
        >
          <option value="">Session: all</option>
          {sessions.map(s => (
            <option key={s.sessionKey} value={s.sessionKey}>
              {s.sessionKey}{s.circuitName ? ` · ${s.circuitName}` : ''}{s.year ? ` ${s.year}` : ''}
            </option>
          ))}
        </select>

        <button
          onClick={fetchAngles}
          disabled={loading}
          className="ml-auto p-1.5 border border-neutral-300 text-neutral-500 hover:text-neutral-800 hover:border-neutral-500 disabled:opacity-40 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Angle list — dark surface, matches AngleReview styling */}
      <div className="bg-neutral-950 border border-neutral-800 p-4">
        <AngleReview
          angles={angles}
          loading={loading}
          showStatus
          hideSelection
          onGenerateAngle={handleGenerateAngle}
          generatingAngleId={generatingAngleId}
          emptyMessage="No saved angles match these filters."
        />
      </div>
    </div>
  );
}

// ── StoriesPanel ──────────────────────────────────────────────────────────────

export function StoriesPanel({ getToken, openStoryId, onOpenStoryConsumed }: { getToken: TokenFactory; openStoryId?: string | null; onOpenStoryConsumed?: () => void }) {
  const [stories, setStories]       = useState<Story[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [selectedStory, setSelected]= useState<Story | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genLogs, setGenLogs]       = useState<string[]>([]);
  const [mode, setMode]             = useState<'stories' | 'angles' | 'archived'>('stories');
  const [archivedStories, setArchivedStories] = useState<Story[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const pollRef                     = useRef<number | null>(null);

  const [newTitle, setNewTitle]       = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORIES[0]);
  const [newSession, setNewSession]   = useState('');
  const [newContext, setNewContext]   = useState('');

  const stApi = storiesApi(getToken);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pubRes, draftRes] = await Promise.all([
        stApi.list({ limit: 50, status: 'published' }) as Promise<{ stories: Story[]; total: number }>,
        stApi.list({ limit: 50, status: 'draft' })     as Promise<{ stories: Story[]; total: number }>,
      ]);
      const merged = [
        ...(draftRes.stories ?? []),
        ...(pubRes.stories ?? []),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setStories(merged);
      setTotal(merged.length);
    } catch { /* silent */ }
    setLoading(false);
  }, [getToken]);

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const res = await stApi.list({ limit: 50, status: 'archived' }) as { stories: Story[] };
      setArchivedStories(res.stories ?? []);
    } catch { /* silent */ }
    setArchivedLoading(false);
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (mode === 'archived') loadArchived();
  }, [mode, loadArchived]);

  // Deep-link open: when AdminPage requests a specific story (e.g. after a per-angle
  // generation completes elsewhere), find that draft and open it in the editor.
  useEffect(() => {
    if (!openStoryId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await stApi.list({ limit: 50, status: 'draft' }) as { stories: Story[] };
        if (cancelled) return;
        const found = (res.stories ?? []).find(s => s.id === openStoryId);
        if (found) {
          await openStory(found);
          onOpenStoryConsumed?.();
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
    // stApi is recreated each render but is stable enough; keep deps minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openStoryId]);

  async function openStory(story: Story) {
    try {
      const full = await stApi.get(story.slug) as Story;
      setSelected(full);
    } catch {
      setSelected(story);
    }
  }

  // Used by the Angles tab when a per-angle generation completes — look up the
  // fresh draft by id and open the editor.
  async function openDraftById(storyId: string) {
    try {
      const res = await stApi.list({ limit: 50, status: 'draft' }) as { stories: Story[] };
      const found = (res.stories ?? []).find(s => s.id === storyId);
      if (found) await openStory(found);
      else alert('Story generated but not found in drafts list.');
    } catch { /* silent */ }
  }

  function resetForm() {
    setNewTitle(''); setNewSession(''); setNewContext('');
    setNewCategory(CATEGORIES[0]); setGenLogs([]);
  }

  async function createDraft() {
    if (!newTitle.trim()) return;
    const created = await stApi.create({
      title: newTitle.trim(), category: newCategory,
      sessionKey: newSession.trim() || null,
      summary: newContext.trim().slice(0, 499), content: [],
    }) as Story;
    setStories(prev => [created, ...prev]);
    setShowCreate(false); resetForm(); setSelected(created);
  }

  async function generateWithAI() {
    if (!newTitle.trim()) return;
    setGenerating(true); setGenLogs(['Creating story draft…']);
    try {
      const created = await stApi.create({
        title: newTitle.trim(), category: newCategory,
        sessionKey: newSession.trim() || null,
        summary: newContext.trim().slice(0, 499), content: [],
      }) as Story;
      setStories(prev => [created, ...prev]);
      setGenLogs(prev => [...prev, 'Dispatching AI pipeline…']);
      await stApi.generate(created.id, { sessionKey: newSession.trim() || undefined, context: newContext.trim() });

      pollRef.current = window.setInterval(async () => {
        try {
          const status = await stApi.runStatus(created.id);
          setGenLogs(status.logs ?? []);
          if (status.status === 'done' || status.status === 'failed') {
            clearInterval(pollRef.current!);
            setGenerating(false); setShowCreate(false); resetForm();
            await load();
            const full = await stApi.get(created.slug) as Story;
            setSelected(full);
          }
        } catch { /* silent */ }
      }, 3000);
    } catch (err) {
      setGenLogs(prev => [...prev, `Error: ${err instanceof Error ? err.message : String(err)}`]);
      setGenerating(false);
    }
  }

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function archiveStory(story: Story, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await stApi.archive(story.id);
      setStories(prev => prev.filter(s => s.id !== story.id));
      setTotal(prev => prev - 1);
    } catch { /* silent */ }
  }

  async function restoreStory(id: string) {
    try {
      await stApi.restore(id);
      setArchivedStories(prev => prev.filter(s => s.id !== id));
    } catch { /* silent */ }
  }

  async function permanentDeleteStory(id: string) {
    try {
      await stApi.permanentDelete(id);
      setArchivedStories(prev => prev.filter(s => s.id !== id));
      setConfirmDeleteId(null);
    } catch { /* silent */ }
  }

  if (selectedStory) {
    return (
      <StoryEditor
        story={selectedStory} getToken={getToken}
        onBack={() => { setSelected(null); load(); }}
        onUpdate={updated => setSelected(updated)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Tab toggle */}
        <div className="inline-flex border border-neutral-200">
          <button
            onClick={() => { setMode('stories'); setConfirmDeleteId(null); }}
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 transition-colors ${
              mode === 'stories'
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <BookOpen size={11} /> Stories
          </button>
          <button
            onClick={() => { setMode('angles'); setConfirmDeleteId(null); }}
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border-l border-neutral-200 transition-colors ${
              mode === 'angles'
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Lightbulb size={11} /> Angles
          </button>
          <button
            onClick={() => { setMode('archived'); setConfirmDeleteId(null); }}
            className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border-l border-neutral-200 transition-colors ${
              mode === 'archived'
                ? 'bg-neutral-900 text-white'
                : 'bg-white text-neutral-500 hover:text-neutral-900'
            }`}
          >
            <Trash2 size={11} /> Archived
          </button>
        </div>

        {mode === 'stories' && (
          <>
            <span className="font-mono text-[11px] text-neutral-400">{total} stories</span>
            <div className="flex gap-2">
              <button onClick={load} disabled={loading}
                className="text-neutral-400 hover:text-neutral-700 transition-colors p-1">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => { setShowCreate(v => !v); setGenLogs([]); }}
                className="flex items-center gap-1.5 font-mono text-[10px] bg-neutral-900 text-white px-3 py-2 hover:bg-neutral-700 transition-colors uppercase tracking-widest">
                <Plus size={11} /> New Story
              </button>
            </div>
          </>
        )}
      </div>

      {mode === 'angles' && (
        <AnglesBrowser getToken={getToken} onOpenStoryId={openDraftById} />
      )}

      {mode === 'archived' && (
        <div className="space-y-1">
          {archivedLoading && archivedStories.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-neutral-300" />
            </div>
          )}
          {!archivedLoading && archivedStories.length === 0 && (
            <div className="text-center py-12 border border-dashed border-neutral-200">
              <Trash2 size={24} className="text-neutral-200 mx-auto mb-3" />
              <p className="font-mono text-xs text-neutral-400">No archived stories.</p>
            </div>
          )}
          {archivedStories.map(story => (
            <div key={story.id} className="border border-neutral-200 bg-white">
              <div className="flex items-center gap-4 px-4 py-3">
                {story.aiGenerated && (
                  <span className="shrink-0 font-mono text-[8px] text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 uppercase tracking-widest">
                    AI
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-sm text-neutral-900 truncate">{story.title}</p>
                  <p className="font-mono text-[10px] text-neutral-400">
                    {story.category} · {new Date(story.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => restoreStory(story.id)}
                    title="Restore to draft"
                    className="flex items-center gap-1 font-mono text-[10px] border border-neutral-200 px-2 py-1 text-neutral-500 hover:border-neutral-500 hover:text-neutral-800 transition-colors"
                  >
                    <RotateCcw size={10} /> Restore
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(story.id)}
                    title="Permanently delete"
                    className="flex items-center gap-1 font-mono text-[10px] border border-red-200 px-2 py-1 text-red-400 hover:border-red-500 hover:text-red-600 transition-colors"
                  >
                    <Trash2 size={10} /> Delete
                  </button>
                </div>
              </div>
              {confirmDeleteId === story.id && (
                <div className="flex items-center gap-3 px-4 py-2.5 border-t border-red-100 bg-red-50/40">
                  <span className="font-mono text-[10px] text-red-600 flex-1">
                    Permanently delete? This cannot be undone.
                  </span>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="font-mono text-[10px] border border-neutral-200 px-2.5 py-1 text-neutral-500 hover:border-neutral-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => permanentDeleteStory(story.id)}
                    className="font-mono text-[10px] bg-red-600 text-white px-2.5 py-1 hover:bg-red-700 transition-colors"
                  >
                    Delete forever
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mode === 'stories' && <>
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border border-[#E10600] bg-red-50/10"
          >
            <div className="p-5 space-y-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#E10600]">New Story</p>
              <div className="grid grid-cols-2 gap-3">
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                  placeholder="Story title *"
                  className="col-span-2 border border-neutral-200 px-3 py-2 font-serif text-base text-neutral-900 focus:outline-none focus:border-[#E10600] bg-white"
                />
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
                  className="border border-neutral-200 px-3 py-2 font-mono text-xs bg-white focus:outline-none focus:border-[#E10600]">
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input value={newSession} onChange={e => setNewSession(e.target.value)}
                  placeholder="Session key (OpenF1)"
                  className="border border-neutral-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#E10600] bg-white"
                />
                <textarea value={newContext} onChange={e => setNewContext(e.target.value)}
                  placeholder="What is this story about? The AI will use this as context."
                  rows={3}
                  className="col-span-2 border border-neutral-200 px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#E10600] resize-none bg-white"
                />
              </div>

              {genLogs.length > 0 && (
                <div className="bg-neutral-900 p-3 max-h-32 overflow-y-auto">
                  {genLogs.map((l, i) => (
                    <div key={i} className="font-mono text-[10px] text-neutral-300 flex gap-2">
                      <span className="text-neutral-600 w-4 text-right shrink-0">{i + 1}</span>
                      <span>{l}</span>
                    </div>
                  ))}
                  {generating && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <Loader2 size={10} className="animate-spin text-amber-400" />
                      <span className="font-mono text-[10px] text-amber-400 animate-pulse">GENERATING…</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setShowCreate(false); resetForm(); }} disabled={generating}
                  className="font-mono text-[10px] uppercase tracking-widest border border-neutral-200 px-3 py-2 text-neutral-500 hover:border-neutral-400 transition-colors disabled:opacity-40">
                  Cancel
                </button>
                <button onClick={createDraft} disabled={!newTitle.trim() || generating}
                  className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest border border-neutral-300 px-3 py-2 text-neutral-600 hover:border-neutral-500 transition-colors disabled:opacity-40">
                  <PenLine size={11} /> Create Draft
                </button>
                <button onClick={generateWithAI} disabled={!newTitle.trim() || generating}
                  className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest bg-[#E10600] text-white px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-40">
                  {generating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                  Generate with AI
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-1">
        {loading && stories.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-neutral-300" />
          </div>
        )}
        {!loading && stories.length === 0 && (
          <div className="text-center py-12 border border-dashed border-neutral-200">
            <BookOpen size={24} className="text-neutral-200 mx-auto mb-3" />
            <p className="font-mono text-xs text-neutral-400">No stories yet. Create one above.</p>
          </div>
        )}
        {stories.map(story => (
          <div key={story.id} onClick={() => openStory(story)}
            className="flex items-center gap-4 px-4 py-3 border border-neutral-200 bg-white hover:border-neutral-400 hover:bg-neutral-50 cursor-pointer transition-all group">
            <span className={`shrink-0 font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 border ${storyStatusStyle(story.status)}`}>
              {story.status}
            </span>
            {story.aiGenerated && (
              <span className="shrink-0 font-mono text-[8px] text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 uppercase tracking-widest">
                AI
              </span>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-serif text-sm text-neutral-900 truncate">{story.title}</p>
              <p className="font-mono text-[10px] text-neutral-400">
                {story.category} · {new Date(story.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {story.status === 'draft' && (
              <button
                onClick={e => archiveStory(story, e)}
                title="Archive story"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-neutral-300 hover:text-red-500 shrink-0"
              >
                <Trash2 size={13} />
              </button>
            )}
            <ChevronRight size={14} className="text-neutral-300 group-hover:text-neutral-600 transition-colors shrink-0" />
          </div>
        ))}
      </div>
      </>}
    </div>
  );
}
