import { useState, useMemo } from 'react';
import { Save, Loader2, BarChart2 } from 'lucide-react';
import { GraphBlock } from '../graphs/GraphBlock';
import { recomputeSpecProjection } from '../../utils/regression';
import { graphsApi } from '../../config/api';
import type { GraphSpec } from '../../types';

type TokenFactory = () => Promise<string | null>;

interface SimulatorProps {
  spec:     GraphSpec;
  getToken: TokenFactory;
  onSaved:  (updated: GraphSpec) => void;
}

function ProjectionControls({
  spec,
  getToken,
  onSaved,
}: SimulatorProps) {
  const cfg = spec.projectionConfig;

  const [method, setMethod]     = useState<'linear' | 'polynomial' | 'exponential'>(cfg?.method ?? 'polynomial');
  const [degree, setDegree]     = useState(2);
  const [histLaps, setHistLaps] = useState(cfg?.historicalLaps ?? 15);
  const [fcLaps, setFcLaps]     = useState(cfg?.forecastLaps   ?? 10);
  const [band, setBand]         = useState(cfg?.confidenceBand ?? true);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState<string | null>(null);

  const simSpec = useMemo(
    () => recomputeSpecProjection(spec, { method, degree, historicalLaps: histLaps, forecastLaps: fcLaps, confidenceBand: band }),
    [spec, method, degree, histLaps, fcLaps, band],
  );

  async function save() {
    setSaving(true);
    setSaveErr(null);
    try {
      const api = graphsApi(getToken);
      const updated = await api.update(spec.id, {
        projectionConfig: { method, historicalLaps: histLaps, forecastLaps: fcLaps, confidenceBand: band },
        dataPoints: simSpec.dataPoints,
      }) as GraphSpec;
      onSaved({ ...spec, ...updated, dataPoints: simSpec.dataPoints });
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Graph preview */}
      <GraphBlock spec={simSpec} />

      {/* Controls */}
      <div className="border border-neutral-700 bg-neutral-800/50 p-4 space-y-3">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500">
          Projection Parameters
        </p>

        {/* Method */}
        <div>
          <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 block mb-1.5">
            Method
          </label>
          <div className="flex gap-1">
            {(['linear', 'polynomial', 'exponential'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={`font-mono text-[10px] px-2.5 py-1 border transition-colors ${
                  method === m
                    ? 'border-f1-red bg-f1-red/10 text-white'
                    : 'border-neutral-600 text-neutral-400 hover:border-neutral-400'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Degree (only for polynomial) */}
        {method === 'polynomial' && (
          <div>
            <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 block mb-1.5">
              Polynomial Degree: {degree}
            </label>
            <input
              type="range" min={1} max={3} value={degree}
              onChange={e => setDegree(Number(e.target.value))}
              className="w-full accent-f1-red"
            />
          </div>
        )}

        {/* Historical laps */}
        <div>
          <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 block mb-1.5">
            Historical Laps: {histLaps}
          </label>
          <input
            type="range" min={5} max={40} value={histLaps}
            onChange={e => setHistLaps(Number(e.target.value))}
            className="w-full accent-f1-red"
          />
        </div>

        {/* Forecast laps */}
        <div>
          <label className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 block mb-1.5">
            Forecast Laps: {fcLaps}
          </label>
          <input
            type="range" min={1} max={25} value={fcLaps}
            onChange={e => setFcLaps(Number(e.target.value))}
            className="w-full accent-f1-red"
          />
        </div>

        {/* Confidence band */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox" checked={band}
            onChange={e => setBand(e.target.checked)}
            className="accent-f1-red"
          />
          <span className="font-mono text-[10px] text-neutral-400">Show confidence band</span>
        </label>

        {/* Save */}
        {saveErr && (
          <p className="font-mono text-[10px] text-red-400">{saveErr}</p>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-neutral-900 border border-neutral-600 text-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest hover:border-f1-red transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          Save Changes
        </button>
      </div>
    </div>
  );
}

interface GraphSimulatorProps {
  graphs:   GraphSpec[];
  getToken: TokenFactory;
}

export function GraphSimulator({ graphs, getToken }: GraphSimulatorProps) {
  const [specsState, setSpecsState] = useState<GraphSpec[]>(graphs);

  const projections = specsState.filter(g => g.type === 'projection');
  const others      = specsState.filter(g => g.type !== 'projection');

  function handleSaved(updated: GraphSpec) {
    setSpecsState(prev => prev.map(g => g.id === updated.id ? updated : g));
  }

  if (specsState.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border border-dashed border-neutral-700">
        <BarChart2 size={28} className="text-neutral-600 mb-3" />
        <p className="font-mono text-xs text-neutral-500">No graphs yet — run the pipeline to generate them.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Projection graphs with simulation controls */}
      {projections.map(spec => (
        <div key={spec.id} className="border border-neutral-700 bg-neutral-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[9px] uppercase bg-amber-900/50 border border-amber-700 text-amber-400 px-2 py-0.5">
              projection · interactive
            </span>
            <span className="font-mono text-xs text-neutral-300">{spec.title ?? 'Projection'}</span>
          </div>
          <ProjectionControls spec={spec} getToken={getToken} onSaved={handleSaved} />
        </div>
      ))}

      {/* Other graphs — preview only */}
      {others.map(spec => (
        <div key={spec.id} className="border border-neutral-700 bg-neutral-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-[9px] uppercase bg-neutral-800 border border-neutral-600 text-neutral-400 px-2 py-0.5">
              {spec.type}
            </span>
            <span className="font-mono text-xs text-neutral-300">{spec.title ?? 'Graph'}</span>
          </div>
          <GraphBlock spec={spec} />
        </div>
      ))}
    </div>
  );
}
