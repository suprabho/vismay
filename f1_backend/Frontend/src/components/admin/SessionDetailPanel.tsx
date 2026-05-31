import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Loader2, RefreshCw, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { fmt, TelemetryBadge, useEnrichmentRetry } from './shared';
import { telemetryApi } from '../../config/api';
import type { SessionSummary } from './types';

type TokenFactory = () => Promise<string | null>;

interface Props {
  sessionKey: string;
  getToken:   TokenFactory;
  onBack:     () => void;
  onRetried?: () => void;
}

const COUNT_LABELS: Array<{ key: keyof SessionSummary['counts']; label: string }> = [
  { key: 'drivers',           label: 'Drivers'        },
  { key: 'laps',              label: 'Laps'           },
  { key: 'aggregates',        label: 'Lap aggregates' },
  { key: 'weatherRows',       label: 'Weather rows'   },
  { key: 'raceControlEvents', label: 'Race control'   },
  { key: 'results',           label: 'Results rows'   },
  { key: 'stints',            label: 'Stints'         },
  { key: 'positionsDrivers',  label: 'Positions drv'  },
  { key: 'rawTelemetryDocs',  label: 'Raw telemetry'  },
];

function CountCell({ label, value, dim }: { label: string; value: number | string; dim?: boolean }) {
  return (
    <div className="border border-neutral-200 px-3 py-2">
      <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">{label}</div>
      <div className={`font-mono text-sm mt-1 ${dim ? 'text-neutral-400' : 'text-neutral-900'}`}>{value}</div>
    </div>
  );
}

function SampleBlock({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  const present = value != null && (typeof value !== 'object' || Object.keys(value as object).length > 0);
  return (
    <div className="border border-neutral-200">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-neutral-50 hover:bg-neutral-100 transition-colors"
      >
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">{title}</span>
        <span className="flex items-center gap-2">
          <span className={`font-mono text-[9px] ${present ? 'text-emerald-600' : 'text-neutral-400'}`}>
            {present ? 'present' : 'missing'}
          </span>
          {open ? <ChevronUp size={12} className="text-neutral-400" /> : <ChevronDown size={12} className="text-neutral-400" />}
        </span>
      </button>
      {open && (
        <pre className="px-3 py-2 font-mono text-[10px] text-neutral-700 bg-white overflow-x-auto max-h-64 overflow-y-auto">
          {present ? JSON.stringify(value, null, 2) : '(no sample available)'}
        </pre>
      )}
    </div>
  );
}

export function SessionDetailPanel({ sessionKey, getToken, onBack, onRetried }: Props) {
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const api = telemetryApi(getToken);
      const data = await api.sessionSummary(sessionKey);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, [getToken, sessionKey]);

  const handleRetried = useCallback(() => {
    onRetried?.();
    void load();
  }, [load, onRetried]);

  const {
    retryTelemetry, retryPositions,
    retryingTelemetry, retryingPositions,
  } = useEnrichmentRetry(getToken, handleRetried);

  useEffect(() => { void load(); }, [load]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-4"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between border border-neutral-200 px-4 py-3 bg-neutral-50">
        <button
          onClick={onBack}
          className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <ArrowLeft size={12} />
          Back to list
        </button>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="text-neutral-400 hover:text-neutral-700 transition-colors"
          title="Reload summary"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !summary && (
        <div className="py-16 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-neutral-300" />
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 flex items-center gap-2">
          <AlertCircle size={12} className="text-red-600" />
          <span className="font-mono text-[11px] text-red-700">{error}</span>
        </div>
      )}

      {summary && (
        <>
          {/* Identity + status */}
          <div className="border border-neutral-200 px-4 py-4">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Session</div>
                <div className="font-mono text-sm text-neutral-900 mt-1">{summary.sessionKey}</div>
                <div className="font-mono text-[11px] text-neutral-500 mt-1">
                  {summary.circuitName} · {summary.country} · {summary.year} · ingested {fmt(summary.ingestedAt)}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Telemetry</div>
                  <div className="flex items-center gap-2 mt-1 justify-end">
                    <TelemetryBadge status={summary.telemetryStatus} />
                    {summary.telemetryStatus === 'failed' && (
                      <button
                        onClick={() => retryTelemetry(summary.sessionKey)}
                        disabled={retryingTelemetry.has(summary.sessionKey)}
                        className="text-neutral-400 hover:text-f1-red transition-colors disabled:opacity-40"
                      >
                        <RefreshCw size={11} className={retryingTelemetry.has(summary.sessionKey) ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Positions</div>
                  <div className="flex items-center gap-2 mt-1 justify-end">
                    <TelemetryBadge status={summary.positionsStatus} />
                    {summary.positionsStatus === 'failed' && (
                      <button
                        onClick={() => retryPositions(summary.sessionKey)}
                        disabled={retryingPositions.has(summary.sessionKey)}
                        className="text-neutral-400 hover:text-f1-red transition-colors disabled:opacity-40"
                      >
                        <RefreshCw size={11} className={retryingPositions.has(summary.sessionKey) ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Errors (full text, not truncated) */}
          {(summary.telemetryError || summary.positionsError) && (
            <div className="border border-red-200 bg-red-50 px-4 py-3 space-y-2">
              {summary.telemetryError && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-red-700">Telemetry error</div>
                  <pre className="font-mono text-[11px] text-red-700 whitespace-pre-wrap mt-1">{summary.telemetryError}</pre>
                </div>
              )}
              {summary.positionsError && (
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-red-700">Positions error</div>
                  <pre className="font-mono text-[11px] text-red-700 whitespace-pre-wrap mt-1">{summary.positionsError}</pre>
                </div>
              )}
            </div>
          )}

          {/* Counts grid */}
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 mb-2">
              What landed in Mongo
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
              {COUNT_LABELS.map(({ key, label }) => (
                <CountCell
                  key={key}
                  label={label}
                  value={summary.counts[key] ?? 0}
                  dim={(summary.counts[key] ?? 0) === 0}
                />
              ))}
              <CountCell
                label="Circuit doc"
                value={summary.circuitPresent ? 'present' : 'missing'}
                dim={!summary.circuitPresent}
              />
            </div>
          </div>

          {/* Drivers strip */}
          {summary.drivers.length > 0 && (
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 mb-2">
                Drivers · {summary.drivers.length}
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.drivers.map(d => (
                  <div
                    key={d.driverNumber}
                    className="flex items-center gap-2 border border-neutral-200 px-2 py-1"
                    title={`${d.fullName} · ${d.teamName}`}
                  >
                    <span
                      className="inline-block w-2 h-2"
                      style={{ background: d.teamColour || '#ccc' }}
                    />
                    <span className="font-mono text-[10px] text-neutral-500">#{d.driverNumber}</span>
                    <span className="font-mono text-[11px] text-neutral-900">{d.abbreviation || d.lastName || '?'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sample data blocks */}
          <div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-500 mb-2">
              Sample data shape (first record from each)
            </div>
            <div className="space-y-2">
              <SampleBlock title="processedLap[0]"          value={summary.samples.processedLap} />
              <SampleBlock title="lapTelemetryAggregate[0]" value={summary.samples.lapAggregate} />
              <SampleBlock title="raw_lap_telemetry sample" value={summary.samples.rawTelemetryFrame} />
              <SampleBlock title="car_positions sample"     value={summary.samples.carPositionFrame} />
              <SampleBlock title="sessionResult[0]"         value={summary.samples.sessionResult} />
              <SampleBlock title="weatherData[0]"           value={summary.samples.weatherRow} />
              <SampleBlock title="raceControlMessages[0]"   value={summary.samples.raceControlEvent} />
              <SampleBlock title="stints[0]"                value={summary.samples.stint} />
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
