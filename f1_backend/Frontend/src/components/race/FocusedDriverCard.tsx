import { useMemo } from 'react';
import type { RaceDriver, AggregatesByDriverLap } from '../../hooks/useRaceData';
import { Sparkline } from './Sparkline';

interface Props {
  driver:      RaceDriver;
  currentLap:  number;
  aggregates:  AggregatesByDriverLap;
  onClose?:    () => void;
}

const SPARK_WINDOW = 5;

export function FocusedDriverCard({ driver, currentLap, aggregates, onClose }: Props) {
  const perLap = aggregates.get(driver.driverNumber);
  const current = perLap?.get(currentLap);

  // Speed trend: last SPARK_WINDOW laps up to currentLap
  const trend = useMemo(() => {
    if (!perLap) return [] as number[];
    const out: number[] = [];
    for (let l = Math.max(1, currentLap - SPARK_WINDOW + 1); l <= currentLap; l++) {
      const a = perLap.get(l);
      if (a) out.push(a.avgSpeed);
    }
    return out;
  }, [perLap, currentLap]);

  const colour = driver.teamColour || '#444';

  return (
    <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm border border-neutral-200 shadow-lg w-[320px] z-20">
      <div
        className="flex items-center gap-3 px-4 py-2.5 border-b border-neutral-100"
        style={{ borderLeftWidth: 3, borderLeftColor: colour }}
      >
        <div
          className="w-8 h-8 flex items-center justify-center font-mono font-bold text-white"
          style={{ backgroundColor: colour }}
        >
          {driver.driverNumber}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs font-bold text-neutral-900 truncate">
            {driver.fullName || driver.abbreviation}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
            {driver.teamName || '—'} · Lap {currentLap}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-f1-red transition-colors"
          >
            Unfocus
          </button>
        )}
      </div>

      {!current ? (
        <div className="px-4 py-6 text-center font-mono text-[10px] text-neutral-400">
          No aggregate data for lap {currentLap}.
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {/* Speed row with sparkline */}
          <div className="flex items-end justify-between">
            <div className="flex flex-col">
              <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Avg Speed</span>
              <span className="font-mono text-2xl font-bold text-neutral-900">
                {Math.round(current.avgSpeed)}
                <span className="font-mono text-[10px] text-neutral-400 ml-1">km/h</span>
              </span>
            </div>
            <Sparkline data={trend} color={colour} width={90} height={30} />
          </div>

          {/* Metric grid */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-neutral-100">
            <Metric label="Max"  value={Math.round(current.maxSpeed)}    suffix="km/h" />
            <Metric label="Thr"  value={Math.round(current.avgThrottlePct)} suffix="%" />
            <Metric label="Gear" value={current.topGear} />
            <Metric label="Brk"  value={current.brakingEvents} />
            <Metric label="DRS"  value={current.drsActivations} />
            <Metric label="Gap"  value={current.minGapToAheadM.toFixed(0)} suffix="m" />
          </div>

          {/* Sector max speeds */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-neutral-100">
            <Metric label="S1 Max" value={Math.round(current.sector1MaxSpeed)} suffix="km/h" small />
            <Metric label="S2 Max" value={Math.round(current.sector2MaxSpeed)} suffix="km/h" small />
            <Metric label="S3 Max" value={Math.round(current.sector3MaxSpeed)} suffix="km/h" small />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, suffix, small }: { label: string; value: number | string; suffix?: string; small?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">{label}</span>
      <span className={`font-mono font-bold text-neutral-900 ${small ? 'text-xs' : 'text-base'}`}>
        {value}
        {suffix && <span className="font-mono text-[9px] text-neutral-400 ml-0.5">{suffix}</span>}
      </span>
    </div>
  );
}
