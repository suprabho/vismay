/**
 * Eval runner.
 *
 * Orchestrates: adapter.fetchSample → judge each article → compute metrics →
 * render HTML + write JSON. App-agnostic: every app-specific concern lives
 * in the adapter passed in by the caller.
 *
 * Usage from an app's worker:
 *   import { runEval } from '@vismay/eval-entities';
 *   import { vizf1Adapter } from './adapter';
 *   await runEval(vizf1Adapter, { since, max, concurrency, judgeModel });
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ArticleResult, EntityEvalAdapter, RunOpts } from './types';
import { createJudge } from './judge';
import { computeMetrics } from './metrics';
import { renderHtml } from './report';

async function runConcurrent<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        // bounds-checked above; items[i] is defined.
        const item = items[i] as T;
        results[i] = await worker(item);
        process.stdout.write('.');
      }
    })
  );
  if (items.length > 0) process.stdout.write('\n');
  return results;
}

export async function runEval(
  adapter: EntityEvalAdapter,
  opts: RunOpts
): Promise<{ htmlPath: string; jsonPath: string }> {
  console.log(
    `[eval-entities] app=${adapter.appName} judge=${opts.judgeModel} since=${opts.since} max=${opts.max}`
  );

  console.log('[eval-entities] fetching sample…');
  const articles = await adapter.fetchSample({ since: opts.since, max: opts.max });
  console.log(`[eval-entities] sampled ${articles.length} articles`);

  if (articles.length === 0) {
    throw new Error('no articles to evaluate — is the DB seeded? does --since reach summarised articles?');
  }

  if (opts.rerunExtraction) {
    if (!adapter.extractLive) {
      throw new Error(`rerunExtraction requested but adapter '${adapter.appName}' has no extractLive method`);
    }
    console.log('[eval-entities] re-extracting entities live with current code (HEAD)…');
    const extractLive = adapter.extractLive.bind(adapter);
    await runConcurrent(
      articles,
      async (a) => {
        try {
          const fresh = await extractLive({ headline: a.headline, body: a.body, publisher: a.publisher });
          a.taggedEntities = fresh;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`[eval-entities] extractLive failed for ${a.id}: ${msg}`);
          a.taggedEntities = [];
        }
      },
      opts.concurrency
    );
  }

  const judge = createJudge({
    model: opts.judgeModel,
    appName: adapter.appName,
    entityTypes: adapter.entityTypes,
  });

  console.log(`[eval-entities] judging with ${opts.judgeModel} (concurrency=${opts.concurrency})…`);
  const verdicts = await runConcurrent(articles, judge, opts.concurrency);
  // verdicts[i] is set for every i in [0, articles.length) by runConcurrent.
  const results: ArticleResult[] = articles.map((article, i) => ({
    article,
    verdict: verdicts[i] as ArticleResult['verdict'],
  }));

  const metrics = computeMetrics(results, adapter.entityTypes);

  const outDir = opts.outputDir ?? resolve(process.cwd());
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `eval-entities-${adapter.appName}-${stamp}`;
  const htmlPath = resolve(outDir, `${base}.html`);
  const jsonPath = resolve(outDir, `${base}.json`);

  const html = renderHtml({
    appName: adapter.appName,
    judgeModel: opts.judgeModel,
    since: opts.since,
    results,
    metrics,
  });
  writeFileSync(htmlPath, html, 'utf8');

  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        appName: adapter.appName,
        judgeModel: opts.judgeModel,
        since: opts.since,
        rerunExtraction: !!opts.rerunExtraction,
        generatedAt: new Date().toISOString(),
        metrics,
        // results omitted from JSON — they're in the HTML; JSON is for trend diffs in CI.
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`[eval-entities] wrote ${htmlPath}`);
  console.log(`[eval-entities] wrote ${jsonPath}`);
  console.log(
    `[eval-entities] articles=${metrics.articles} errored=${metrics.errored} ` +
      `P=${(metrics.totals.precision * 100).toFixed(1)}% ` +
      `R=${(metrics.totals.recall * 100).toFixed(1)}% ` +
      `F1=${(metrics.totals.f1 * 100).toFixed(1)}%`
  );

  return { htmlPath, jsonPath };
}
