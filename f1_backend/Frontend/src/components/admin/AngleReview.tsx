import { Loader2, Lightbulb, BookOpen, Check, Wand2 } from 'lucide-react';
import { PRIORITY_COLOR } from './shared';
import type { AnalysisAngle, AngleStatus } from '../../config/api';

const STATUS_COLOR: Record<AngleStatus, string> = {
  proposed:  'text-neutral-400 border-neutral-700 bg-neutral-800/40',
  selected:  'text-emerald-400 border-emerald-700 bg-emerald-950/30',
  rejected:  'text-red-400 border-red-800 bg-red-950/30',
  generated: 'text-sky-400 border-sky-700 bg-sky-950/30',
};

const EMPTY_SET: ReadonlySet<string> = new Set();

interface AngleReviewProps {
  angles:             AnalysisAngle[];
  loading:            boolean;
  selected?:          Set<string>;
  generating?:        boolean;
  onToggle?:          (id: string) => void;
  onSetAll?:          (select: boolean) => void;
  onGenerate?:        () => void;
  showStatus?:        boolean;
  generateLabel?:     string;
  onGenerateAngle?:   (angle: AnalysisAngle) => void;
  generatingAngleId?: string | null;
  hideSelection?:     boolean;
  emptyMessage?:      string;
}

interface AngleCardProps {
  angle:              AnalysisAngle;
  checked:            boolean;
  showStatus?:        boolean;
  hideSelection?:     boolean;
  onToggle?:          () => void;
  onGenerateAngle?:   (angle: AnalysisAngle) => void;
  generatingAngleId?: string | null;
}

function AngleCard({
  angle, checked, showStatus, hideSelection, onToggle, onGenerateAngle, generatingAngleId,
}: AngleCardProps) {
  const isThisGenerating = generatingAngleId === angle.id;
  const otherGenerating  = !!generatingAngleId && !isThisGenerating;
  const alreadyGenerated = angle.status === 'generated';

  const header = (
    <div className="flex items-center gap-2">
      {!hideSelection && (
        <span className={`flex items-center justify-center w-4 h-4 border shrink-0 ${
          checked ? 'bg-emerald-600 border-emerald-600' : 'border-neutral-600'
        }`}>
          {checked && <Check size={11} className="text-white" />}
        </span>
      )}
      <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${PRIORITY_COLOR[angle.priority] ?? PRIORITY_COLOR.low}`}>
        {angle.priority}
      </span>
      <span className="font-mono text-xs text-neutral-100 font-medium flex-1">{angle.title}</span>
      {showStatus && (
        <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border shrink-0 ${STATUS_COLOR[angle.status] ?? STATUS_COLOR.proposed}`}>
          {angle.status}
        </span>
      )}
      {onGenerateAngle && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); if (!otherGenerating && !isThisGenerating) onGenerateAngle(angle); }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && !otherGenerating && !isThisGenerating) {
              e.preventDefault(); e.stopPropagation(); onGenerateAngle(angle);
            }
          }}
          aria-disabled={otherGenerating || isThisGenerating}
          title={alreadyGenerated ? 'Regenerate just this angle' : 'Generate just this angle'}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 border shrink-0 font-mono text-[9px] uppercase tracking-widest transition-colors ${
            isThisGenerating
              ? 'border-amber-600 text-amber-400 bg-amber-950/30'
              : otherGenerating
                ? 'border-neutral-800 text-neutral-600 cursor-not-allowed'
                : 'border-neutral-600 text-neutral-200 hover:border-f1-red hover:text-f1-red cursor-pointer'
          }`}
        >
          {isThisGenerating ? <Loader2 size={9} className="animate-spin" /> : <Wand2 size={9} />}
          {isThisGenerating ? 'Generating' : 'Generate story'}
        </span>
      )}
    </div>
  );

  const bodyPad = hideSelection ? 'pl-0' : 'pl-6';
  const body = (
    <>
      <p className={`font-mono text-[10px] text-neutral-300 leading-relaxed ${bodyPad}`}>{angle.focus}</p>
      {angle.rationale && (
        <p className={`font-mono text-[10px] text-neutral-500 leading-relaxed ${bodyPad} italic`}>{angle.rationale}</p>
      )}
      {angle.supportingSignalIds.length > 0 && (
        <p className={`font-mono text-[9px] text-neutral-600 ${bodyPad}`}>
          {angle.supportingSignalIds.length} supporting signal{angle.supportingSignalIds.length === 1 ? '' : 's'}
        </p>
      )}
    </>
  );

  const baseClass = `w-full text-left border p-3 space-y-1.5 transition-colors ${
    checked && !hideSelection
      ? 'border-emerald-700 bg-emerald-950/20'
      : 'border-neutral-700 bg-neutral-800/30 hover:border-neutral-500'
  }`;

  if (hideSelection) {
    return <div className={baseClass}>{header}{body}</div>;
  }
  return (
    <button type="button" onClick={onToggle} className={baseClass}>
      {header}
      {body}
    </button>
  );
}

export function AngleReview({
  angles, loading, selected, generating, onToggle, onSetAll, onGenerate, showStatus, generateLabel,
  onGenerateAngle, generatingAngleId, hideSelection, emptyMessage,
}: AngleReviewProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center">
        <Loader2 size={16} className="animate-spin text-neutral-500" />
        <span className="font-mono text-xs text-neutral-500">Loading angles…</span>
      </div>
    );
  }

  if (angles.length === 0) {
    return (
      <p className="font-mono text-xs text-neutral-500 text-center py-8">
        {emptyMessage ?? 'No angles found.'}
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

  const effectiveSelected = selected ?? EMPTY_SET;
  const selectedCount     = angles.filter(a => effectiveSelected.has(a.id)).length;
  const showToolbar       = !hideSelection && (!!onSetAll || selectedCount > 0);

  return (
    <div className="space-y-4">
      {/* Toolbar — only when bulk selection is active */}
      {showToolbar && (
        <div className="flex items-center gap-3 px-4 py-3 border border-neutral-700 bg-neutral-900/60">
          <Lightbulb size={14} className="text-amber-400" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-300 font-bold">
            {angles.length} angles · {selectedCount} selected
          </span>
          {onSetAll && (
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
          )}
        </div>
      )}

      {/* Grouped angle cards */}
      <div className="space-y-5">
        {[...groups.values()].map(group => (
          <div key={group.label}>
            <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500 mb-2">{group.label}</p>
            <div className="space-y-2">
              {group.angles.map(a => (
                <AngleCard
                  key={a.id}
                  angle={a}
                  checked={effectiveSelected.has(a.id)}
                  showStatus={showStatus}
                  hideSelection={hideSelection}
                  onToggle={onToggle ? () => onToggle(a.id) : undefined}
                  onGenerateAngle={onGenerateAngle}
                  generatingAngleId={generatingAngleId}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bulk Generate — only when caller wires onGenerate */}
      {onGenerate && (
        <button
          onClick={onGenerate}
          disabled={!!generating || selectedCount === 0}
          className="w-full flex items-center justify-center gap-2 bg-f1-red text-white py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
          {generating ? 'Launching…' : (generateLabel ?? `Generate Stories from ${selectedCount} selected`)}
        </button>
      )}
    </div>
  );
}
