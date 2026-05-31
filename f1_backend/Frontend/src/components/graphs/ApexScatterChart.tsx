import {
  ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { GraphSpec } from '../../types';

const MONO = { fontFamily: 'monospace', fontSize: 9 };

export function ApexScatterChart({ spec }: { spec: GraphSpec }) {
  const xKey = spec.xAxis?.key ?? 'x';
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#f0f0f0" />
        <XAxis
          type="number"
          dataKey={xKey}
          tick={MONO}
          label={{ value: spec.xAxis?.unit ?? '', position: 'insideBottom', offset: -8, style: MONO }}
        />
        <YAxis
          type="number"
          tick={MONO}
          domain={spec.yAxis?.domain?.length ? spec.yAxis.domain : ['auto', 'auto']}
        />
        <Tooltip
          cursor={{ strokeDasharray: '2 4' }}
          contentStyle={{ fontFamily: 'monospace', fontSize: 10, border: '1px solid #e5e5e5' }}
        />
        {spec.series.map(s => (
          <Scatter
            key={s.id}
            name={s.label}
            data={spec.dataPoints.map(d => ({ ...d, _y: d[s.dataKey] }))}
            dataKey="_y"
            fill={s.color}
          />
        ))}
        {spec.series.length > 1 && (
          <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 9, paddingTop: 8 }} />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
