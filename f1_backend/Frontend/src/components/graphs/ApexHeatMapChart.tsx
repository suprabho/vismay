import { GraphSpec } from '../../types';

interface Cell { x: string | number; y: string | number; value: number }

export function ApexHeatMapChart({ spec }: { spec: GraphSpec }) {
  const cells = (spec.dataPoints || []) as unknown as Cell[];
  if (cells.length === 0) {
    return (
      <div className="font-mono text-[10px] text-neutral-400 py-4 text-center">
        No heat map data
      </div>
    );
  }

  const xs = Array.from(new Set(cells.map(c => String(c.x))));
  const ys = Array.from(new Set(cells.map(c => String(c.y))));
  const values = cells.map(c => c.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const baseColor = spec.series[0]?.color ?? '#E10600';
  const intensity = (v: number) => Math.max(0.05, (v - min) / range);

  const lookup = new Map<string, number>();
  cells.forEach(c => lookup.set(`${c.x}|${c.y}`, c.value));

  return (
    <div className="w-full overflow-x-auto">
      <table className="font-mono text-[9px] border-collapse">
        <thead>
          <tr>
            <th className="text-neutral-400 px-1 text-left">
              {spec.yAxis?.label ?? ''} \ {spec.xAxis?.label ?? ''}
            </th>
            {xs.map(x => (
              <th key={x} className="text-neutral-400 px-1 font-normal">{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ys.map(y => (
            <tr key={y}>
              <td className="text-neutral-500 pr-2 font-normal">{y}</td>
              {xs.map(x => {
                const v = lookup.get(`${x}|${y}`);
                return (
                  <td
                    key={x}
                    className="border border-white text-center"
                    style={{
                      width: 28, height: 22,
                      backgroundColor: v == null ? '#f5f5f5' : baseColor,
                      opacity: v == null ? 1 : intensity(v),
                      color: v != null && intensity(v) > 0.5 ? '#fff' : '#171717',
                    }}
                    title={`${y} / ${x}: ${v ?? '—'}`}
                  >
                    {v != null ? v.toFixed(0) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-2 font-mono text-[8px] text-neutral-400 mt-2">
        <span>{min.toFixed(1)}</span>
        <div
          className="h-2 flex-1 max-w-[120px]"
          style={{ background: `linear-gradient(to right, ${baseColor}10, ${baseColor})` }}
        />
        <span>{max.toFixed(1)}</span>
      </div>
    </div>
  );
}
