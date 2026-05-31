import {
  LineChart, Line,
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { GraphSpec } from '../../types';

const MONO = { fontFamily: 'monospace', fontSize: 9 };

export function ApexLineChart({ spec }: { spec: GraphSpec }) {
  const s = spec.series[0];
  const isArea = spec.type === 'area';
  const isSpark = spec.type === 'sparkline';

  if (isSpark) {
    return (
      <ResponsiveContainer width="100%" height={60}>
        <LineChart data={spec.dataPoints} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
          {s && <Line type="monotone" dataKey={s.dataKey} stroke={s.color} strokeWidth={1.25} dot={false} name={s.label} />}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (isArea) {
    return (
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={spec.dataPoints} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#f0f0f0" />
          <XAxis dataKey={spec.xAxis?.key ?? 'x'} tick={MONO}
            label={{ value: spec.xAxis?.unit ?? '', position: 'insideBottom', offset: -8, style: MONO }} />
          <YAxis tick={MONO} domain={spec.yAxis?.domain?.length ? spec.yAxis.domain : ['auto', 'auto']} />
          <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 10, border: '1px solid #e5e5e5' }} />
          {s && (
            <Area type="monotone" dataKey={s.dataKey}
              stroke={s.color} strokeWidth={1.5}
              fill={s.color} fillOpacity={0.15}
              dot={false} name={s.label} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={spec.dataPoints} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="#f0f0f0" />
        <XAxis dataKey={spec.xAxis?.key ?? 'x'} tick={MONO}
          label={{ value: spec.xAxis?.unit ?? '', position: 'insideBottom', offset: -8, style: MONO }} />
        <YAxis tick={MONO} domain={spec.yAxis?.domain?.length ? spec.yAxis.domain : ['auto', 'auto']} />
        <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 10, border: '1px solid #e5e5e5' }} />
        {s && <Line type="monotone" dataKey={s.dataKey} stroke={s.color} strokeWidth={1.5} dot={false} name={s.label} />}
      </LineChart>
    </ResponsiveContainer>
  );
}
