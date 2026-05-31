import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend, ResponsiveContainer,
} from 'recharts';
import { GraphSpec } from '../../types';

const MONO = { fontFamily: 'monospace', fontSize: 9 };

export function ApexProjectionChart({ spec }: { spec: GraphSpec }) {
  const projConf = spec.projectionConfig;
  const projectedSeries = spec.series.find(s => s.type === 'projected');
  const splitLap = projectedSeries
    ? (spec.dataPoints.find(d => d[projectedSeries.dataKey] != null)?.lap as string | number | undefined) ?? null
    : null;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={spec.dataPoints} margin={{ top: 8, right: 24, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#f0f0f0" />
        <XAxis
          dataKey={spec.xAxis?.key ?? 'lap'}
          tick={MONO}
          label={{ value: spec.xAxis?.unit ?? 'Lap', position: 'insideBottom', offset: -8, style: MONO }}
        />
        <YAxis
          tick={MONO}
          domain={spec.yAxis?.domain?.length ? spec.yAxis.domain : ['auto', 'auto']}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        <Tooltip
          contentStyle={{ fontFamily: 'monospace', fontSize: 10, border: '1px solid #e5e5e5' }}
          formatter={(v: number) => [`${v.toFixed(3)}s`, '']}
        />
        {projConf?.confidenceBand && (
          <Area dataKey="confidenceHigh" fill="#E10600" fillOpacity={0.06} stroke="none" />
        )}
        {spec.series.map(s =>
          s.type === 'actual' ? (
            <Line
              key={s.id} type="monotone" dataKey={s.dataKey}
              stroke={s.color} strokeWidth={1.5} dot={false}
              name={s.label} connectNulls
            />
          ) : (
            <Line
              key={s.id} type="monotone" dataKey={s.dataKey}
              stroke={s.color} strokeWidth={1.5}
              strokeDasharray={s.strokeDash ?? '4 2'}
              dot={false} name={s.label} connectNulls
            />
          )
        )}
        {splitLap != null && (
          <ReferenceLine
            x={splitLap} stroke="#E10600" strokeWidth={0.8} strokeDasharray="2 2"
            label={{ value: 'FORECAST →', position: 'top', style: { ...MONO, fill: '#E10600' } }}
          />
        )}
        <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 9, paddingTop: 12 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
