import { GraphSpec } from '../../types';

const COMPOUND_COLOR: Record<string, string> = {
  soft: '#E10600',
  medium: '#FFD700',
  hard: '#CCCCCC',
  inter: '#39B54A',
  wet: '#005AFF',
};

interface Stint { driverNumber?: number; compound?: string; lapStart?: number; lapEnd?: number; label?: string }

export function ApexTireMapChart({ spec }: { spec: GraphSpec }) {
  const stints = spec.dataPoints as Stint[];
  const drivers = [...new Set(stints.map(s => s.driverNumber ?? s.label ?? 'UNK'))];
  const maxLap = Math.max(...stints.map(s => s.lapEnd ?? 0), 1);

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[400px] space-y-1 py-2">
        {drivers.map(drv => {
          const driverStints = stints.filter(s => (s.driverNumber ?? s.label) === drv);
          return (
            <div key={String(drv)} className="flex items-center gap-2">
              <span className="font-mono text-[9px] text-neutral-400 w-8 text-right shrink-0">
                #{drv}
              </span>
              <div className="relative h-5 flex-1 bg-neutral-100 rounded-sm overflow-hidden">
                {driverStints.map((stint, i) => {
                  const start = ((stint.lapStart ?? 0) / maxLap) * 100;
                  const width = (((stint.lapEnd ?? 0) - (stint.lapStart ?? 0)) / maxLap) * 100;
                  const compound = (stint.compound ?? 'hard').toLowerCase();
                  const color = COMPOUND_COLOR[compound] ?? '#999';
                  return (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-r border-white/40"
                      style={{ left: `${start}%`, width: `${width}%`, backgroundColor: color }}
                      title={`${compound} — laps ${stint.lapStart}–${stint.lapEnd}`}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="flex gap-3 pt-2 pl-10">
          {Object.entries(COMPOUND_COLOR).map(([c, color]) => (
            <span key={c} className="flex items-center gap-1 font-mono text-[8px] text-neutral-400 uppercase">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
