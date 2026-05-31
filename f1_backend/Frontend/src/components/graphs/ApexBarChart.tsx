import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { GraphSpec } from '../../types';

const MONO = { fontFamily: 'monospace', fontSize: 9 };

interface Props { spec: GraphSpec; grouped?: boolean }

export function ApexBarChart({ spec, grouped = false }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={spec.dataPoints} margin={{ top: 8, right: 16, left: 0, bottom: 16 }}
        barCategoryGap={grouped ? '20%' : '40%'}>
        <CartesianGrid strokeDasharray="2 4" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey={spec.xAxis?.key ?? 'x'} tick={MONO} />
        <YAxis tick={MONO} domain={spec.yAxis?.domain?.length ? spec.yAxis.domain : ['auto', 'auto']} />
        <Tooltip contentStyle={{ fontFamily: 'monospace', fontSize: 10, border: '1px solid #e5e5e5' }} />
        {spec.series.map(s => (
          <Bar key={s.id} dataKey={s.dataKey} fill={s.color} name={s.label}
            radius={[2, 2, 0, 0]} maxBarSize={grouped ? 20 : 40} />
        ))}
        {spec.series.length > 1 && (
          <Legend wrapperStyle={{ fontFamily: 'monospace', fontSize: 9, paddingTop: 8 }} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
