import type { GraphSpec } from '../types';

function linReg(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((acc, x, i) => acc + x * ys[i], 0);
  const sx2 = xs.reduce((acc, x) => acc + x * x, 0);
  const D = n * sx2 - sx * sx;
  if (Math.abs(D) < 1e-10) return [sy / n, 0];
  return [(sy * sx2 - sx * sxy) / D, (n * sxy - sx * sy) / D];
}

function polyReg2(xs: number[], ys: number[]): [number, number, number] {
  let sx = 0, sx2 = 0, sx3 = 0, sx4 = 0, sy = 0, sxy = 0, sx2y = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i], x2 = x * x;
    sx += x; sx2 += x2; sx3 += x2 * x; sx4 += x2 * x2;
    sy += y; sxy += x * y; sx2y += x2 * y;
  }
  const n = xs.length;
  const M = [
    [n,   sx,  sx2, sy   ],
    [sx,  sx2, sx3, sxy  ],
    [sx2, sx3, sx4, sx2y ],
  ];
  for (let col = 0; col < 3; col++) {
    for (let row = col + 1; row < 3; row++) {
      if (Math.abs(M[col][col]) < 1e-10) continue;
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= 3; k++) M[row][k] -= f * M[col][k];
    }
  }
  const c = M[2][3] / M[2][2];
  const b = (M[1][3] - M[1][2] * c) / M[1][1];
  const a = (M[0][3] - M[0][2] * c - M[0][1] * b) / M[0][0];
  return [isNaN(a) ? 0 : a, isNaN(b) ? 0 : b, isNaN(c) ? 0 : c];
}

function residualStd(xs: number[], ys: number[], predict: (x: number) => number, df: number): number {
  const sum = xs.reduce((acc, x, i) => {
    const r = ys[i] - predict(x);
    return acc + r * r;
  }, 0);
  return Math.sqrt(sum / Math.max(df, 1));
}

export interface ProjectedPoint {
  x: number;
  y: number;
  yLow?: number;
  yHigh?: number;
}

export function computeProjection(
  xValues: number[],
  yValues: number[],
  method: 'linear' | 'polynomial' | 'exponential',
  degree: number,
  forecastCount: number,
  confidenceBand: boolean,
): ProjectedPoint[] {
  const n = xValues.length;
  if (n < 2 || forecastCount < 1) return [];

  const lastX = xValues[n - 1];
  const step = n > 1 ? (xValues[n - 1] - xValues[0]) / (n - 1) : 1;

  let predict: (x: number) => number;
  let std = 0;

  if (method === 'exponential') {
    const logY = yValues.map(y => Math.log(Math.max(y, 1e-10)));
    const [a, b] = linReg(xValues, logY);
    predict = x => Math.exp(a + b * x);
    if (confidenceBand) std = residualStd(xValues, yValues, predict, n - 2);
  } else if (method === 'polynomial' && degree >= 2) {
    const [a, b, c] = polyReg2(xValues, yValues);
    predict = x => a + b * x + c * x * x;
    if (confidenceBand) std = residualStd(xValues, yValues, predict, n - 3);
  } else {
    const [a, b] = linReg(xValues, yValues);
    predict = x => a + b * x;
    if (confidenceBand) std = residualStd(xValues, yValues, predict, n - 2);
  }

  return Array.from({ length: forecastCount }, (_, i) => {
    const x = lastX + (i + 1) * step;
    const y = predict(x);
    const pt: ProjectedPoint = { x: Math.round(x), y: Math.round(y * 1000) / 1000 };
    if (confidenceBand && std > 0) {
      pt.yLow = Math.round((y - std) * 1000) / 1000;
      pt.yHigh = Math.round((y + std) * 1000) / 1000;
    }
    return pt;
  });
}

export function recomputeSpecProjection(
  spec: GraphSpec,
  params: {
    method: 'linear' | 'polynomial' | 'exponential';
    degree: number;
    historicalLaps: number;
    forecastLaps: number;
    confidenceBand: boolean;
  },
): GraphSpec {
  if (spec.type !== 'projection') return spec;

  const xKey = spec.xAxis?.key ?? 'lap';
  const actualSeries = spec.series.filter(s => s.type === 'actual');
  const projectedSeries = spec.series.filter(s => s.type === 'projected');

  const actualPoints = spec.dataPoints.filter(pt =>
    actualSeries.some(s => pt[s.dataKey] != null),
  );

  const historical = actualPoints.slice(-params.historicalLaps);
  if (historical.length < 2) return spec;

  const xVals = historical.map(pt => Number(pt[xKey]));
  const lastX = xVals[xVals.length - 1];

  const newActualPoints = historical.map(pt => {
    const row: Record<string, unknown> = { [xKey]: pt[xKey] };
    for (const s of spec.series) row[s.dataKey] = pt[s.dataKey] ?? null;
    return row;
  });

  // Compute projection per actual→projected series pair (matched by index)
  const projByKey = new Map<string, number[]>();
  actualSeries.forEach((actual, idx) => {
    const proj = projectedSeries[idx];
    if (!proj) return;
    const yVals = historical
      .map(pt => Number(pt[actual.dataKey]))
      .filter(v => isFinite(v));
    if (yVals.length < 2) return;
    const xForThis = xVals.slice(-yVals.length);
    const pts = computeProjection(xForThis, yVals, params.method, params.degree, params.forecastLaps, false);
    projByKey.set(proj.dataKey, pts.map(p => p.y));
  });

  const newProjPoints: Record<string, unknown>[] = Array.from(
    { length: params.forecastLaps },
    (_, i) => {
      const row: Record<string, unknown> = { [xKey]: Math.round(lastX + i + 1) };
      for (const s of actualSeries) row[s.dataKey] = null;
      for (const [dataKey, vals] of projByKey) row[dataKey] = vals[i] ?? null;
      return row;
    },
  );

  return {
    ...spec,
    dataPoints: [...newActualPoints, ...newProjPoints],
    projectionConfig: {
      method: params.method,
      historicalLaps: params.historicalLaps,
      forecastLaps: params.forecastLaps,
      confidenceBand: params.confidenceBand,
    },
  };
}
