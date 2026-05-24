/**
 * Aggregate judge verdicts into precision / recall / F1, overall and per
 * entity type and per publisher.
 */

import type { ArticleResult, Metrics, PRF } from './types';

function prf(correct: number, spurious: number, missing: number): PRF {
  const precDenom = correct + spurious;
  const recDenom = correct + missing;
  const precision = precDenom === 0 ? 0 : correct / precDenom;
  const recall = recDenom === 0 ? 0 : correct / recDenom;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { correct, spurious, missing, precision, recall, f1 };
}

export function computeMetrics(
  results: ArticleResult[],
  entityTypes: readonly string[]
): Metrics {
  let totalCorrect = 0;
  let totalSpurious = 0;
  let totalMissing = 0;

  const typeAcc: Record<string, { correct: number; spurious: number; missing: number }> = {};
  for (const t of entityTypes) typeAcc[t] = { correct: 0, spurious: 0, missing: 0 };

  const pubAcc = new Map<string, { articles: number; spurious: number; missing: number }>();

  let errored = 0;
  for (const r of results) {
    if ('error' in r.verdict) {
      errored += 1;
      continue;
    }
    const v = r.verdict;
    totalCorrect += v.correct.length;
    totalSpurious += v.spurious.length;
    totalMissing += v.missing.length;

    const bump = (type: string, field: 'correct' | 'spurious' | 'missing') => {
      const acc = (typeAcc[type] ??= { correct: 0, spurious: 0, missing: 0 });
      acc[field] += 1;
    };
    for (const e of v.correct) bump(e.type, 'correct');
    for (const e of v.spurious) bump(e.type, 'spurious');
    for (const e of v.missing) bump(e.type, 'missing');

    const pub = pubAcc.get(r.article.publisher) ?? { articles: 0, spurious: 0, missing: 0 };
    pub.articles += 1;
    pub.spurious += v.spurious.length;
    pub.missing += v.missing.length;
    pubAcc.set(r.article.publisher, pub);
  }

  const byType: Metrics['byType'] = {};
  for (const [t, acc] of Object.entries(typeAcc)) {
    byType[t] = { ...prf(acc.correct, acc.spurious, acc.missing), support: acc.correct + acc.missing };
  }

  const byPublisher: Metrics['byPublisher'] = Array.from(pubAcc.entries())
    .map(([publisher, acc]) => ({ publisher, ...acc }))
    .sort((a, b) => b.spurious + b.missing - (a.spurious + a.missing));

  return {
    articles: results.length,
    errored,
    totals: prf(totalCorrect, totalSpurious, totalMissing),
    byType,
    byPublisher,
  };
}
