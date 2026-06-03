import { CheckCircle, Loader2, Circle } from 'lucide-react';
import type { RunStatus, RunPipeline } from './types';

const LANGGRAPH_NODES = [
  { id: 'load_session',         label: 'Load Session'   },
  { id: 'normalize_laps',       label: 'Normalize'      },
  { id: 'detect_events',        label: 'Detect Events'  },
  { id: 'compute_deltas',       label: 'Deltas'         },
  { id: 'detect_signals',       label: 'Signals'        },
  { id: 'build_projections',    label: 'Projections'    },
  { id: 'generate_graph_specs', label: 'Graph Specs'    },
  { id: 'persist_results',      label: 'Persist'        },
] as const;

const CREWAI_NODES = [
  { id: 'TelemetryAnalyst', label: 'Telemetry\nAnalyst' },
  { id: 'SignalDetector',   label: 'Signal\nDetector'  },
  { id: 'StoryWriter',      label: 'Story\nWriter'     },
  { id: 'ChartCurator',     label: 'Chart\nCurator'    },
  { id: 'FactChecker',      label: 'Fact\nChecker'     },
] as const;

type NodeStatus = 'idle' | 'running' | 'done' | 'failed';

function inferNodeStatuses(
  nodes: readonly { id: string; label: string }[],
  logs: string[],
  overallStatus: RunStatus,
): NodeStatus[] {
  if (overallStatus === 'queued') return nodes.map(() => 'idle');

  const logText = logs.join('\n').toLowerCase();
  const mentioned = nodes.map(n => logText.includes(n.id.toLowerCase()));

  if (overallStatus === 'done') return nodes.map(() => 'done');

  if (overallStatus === 'failed') {
    const lastDone = mentioned.lastIndexOf(true);
    return nodes.map((_, i) => {
      if (i < lastDone)  return 'done';
      if (i === lastDone) return 'failed';
      return 'idle';
    });
  }

  // running
  const lastMentioned = mentioned.lastIndexOf(true);
  const nextIdx = lastMentioned + 1;
  return nodes.map((_, i) => {
    if (i < nextIdx)    return 'done';
    if (i === nextIdx)  return 'running';
    return 'idle';
  });
}

function NodeDot({ status }: { status: NodeStatus }) {
  if (status === 'done')    return <CheckCircle size={14} className="text-emerald-500" />;
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-amber-400" />;
  if (status === 'failed')  return <Circle size={14} className="text-red-500 fill-red-500" />;
  return <Circle size={14} className="text-neutral-600" />;
}

function NodeCard({ label, status }: { label: string; status: NodeStatus }) {
  const ring =
    status === 'running' ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_8px_0] shadow-amber-400/30' :
    status === 'done'    ? 'border-emerald-700 bg-emerald-950/20' :
    status === 'failed'  ? 'border-red-700 bg-red-950/20' :
                           'border-neutral-700 bg-neutral-800/40';

  return (
    <div className={`flex flex-col items-center gap-1.5 px-3 py-2 border rounded min-w-[72px] transition-all duration-300 ${ring}`}>
      <NodeDot status={status} />
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-300 text-center leading-tight whitespace-pre-line">
        {label}
      </span>
    </div>
  );
}

interface PipelineDAGProps {
  pipeline:      RunPipeline;
  overallStatus: RunStatus;
  logs:          string[];
}

export function PipelineDAG({ pipeline, overallStatus, logs }: PipelineDAGProps) {
  const showLangGraph = pipeline === 'langraph_telemetry' || pipeline === 'full';
  const showCrewAI    = pipeline === 'crew_story'         || pipeline === 'full';

  const lgStatuses  = inferNodeStatuses(LANGGRAPH_NODES, logs, overallStatus);
  const crewStatuses = inferNodeStatuses(CREWAI_NODES,   logs, overallStatus);

  return (
    <div className="space-y-5">
      {showLangGraph && (
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mb-3">
            LangGraph · Telemetry Analysis
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {LANGGRAPH_NODES.map((node, i) => (
              <div key={node.id} className="flex items-center gap-1">
                <NodeCard label={node.label} status={lgStatuses[i]} />
                {i < LANGGRAPH_NODES.length - 1 && (
                  <span className="text-neutral-600 font-mono text-xs select-none">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showCrewAI && (
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mb-3">
            CrewAI · Story Generation
          </p>
          <div className="flex items-center gap-1 flex-wrap">
            {CREWAI_NODES.map((node, i) => (
              <div key={node.id} className="flex items-center gap-1">
                <NodeCard label={node.label} status={crewStatuses[i]} />
                {i < CREWAI_NODES.length - 1 && (
                  <span className="text-neutral-600 font-mono text-xs select-none">→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
