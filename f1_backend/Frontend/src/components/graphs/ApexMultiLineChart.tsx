import {
  LineChart, Line,
  ComposedChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { GraphSpec } from '../../types';

const MONO = { fontFamily: 'monospace', fontSize: 9 };

export function ApexMultiLineChart({ spec }: { spec: GraphSpec }) {
  const hasBrake = spec.series.some(s => s.id === 'brake' || s.dataKey === 'brake');

  if (hasBrake) {
    const brakeSeries = spec.series.find(s => s.id === 'brake' || s.dataKey === 'brake');
    const lineSeries  = spec.series.filter(s => s !== brakeSeries);
    return (
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={spec.dataPoints} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#f0f0f0" />
          <XAxis dataKey={spec.xAxis?.key ?? 'x'} tick={MONO}
            label={{ value: spec.xAxis?.unit ?? '', position: 'insideBottom', offset: -8, style: MONO }} />
          <YAxis tick={MONO} domain={spec.yAxis?.domain?.length ? spec.yAxis.domain : ['auto', 'auto']} />
          <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 10, border: '1px solid #e5e5e5' }} />
          {brakeSeries && (
            <Area
              type="stepAfter" dataKey={brakeSeries.dataKey}
              stroke="none" fill={brakeSeries.color} fillOpacity={0.18}
              name={brakeSeries.label} isAnimationActive={false}
            />
          )}
          {lineSeries.map(s => (
            <Line
              key={s.id} type="monotone" dataKey={s.dataKey}
              stroke={s.color} strokeWidth={1.5} dot={false}
              name={s.label} connectNulls strokeDasharray={s.strokeDash}
            />
          ))}
          <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 9, paddingTop: 8 }} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={spec.dataPoints} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#f0f0f0" />
        <XAxis dataKey={spec.xAxis?.key ?? 'lap'} tick={MONO}
          label={{ value: spec.xAxis?.unit ?? '', position: 'insideBottom', offset: -8, style: MONO }} />
        <YAxis tick={MONO} domain={spec.yAxis?.domain?.length ? spec.yAxis.domain : ['auto', 'auto']} />
        <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 10, border: '1px solid #e5e5e5' }} />
        {spec.series.map(s => (
          <Line
            key={s.id} type="monotone" dataKey={s.dataKey}
            stroke={s.color} strokeWidth={1.5} dot={false}
            name={s.label} connectNulls
            strokeDasharray={s.strokeDash}
          />
        ))}
        <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 9, paddingTop: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
