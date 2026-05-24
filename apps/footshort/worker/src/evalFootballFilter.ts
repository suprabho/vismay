/**
 * One-off eval: would an `is_football_news` Gemini guard correctly filter
 * non-football articles that currently leak into the feed?
 *
 * Pulls a stratified sample of recent `status='summarized'` articles, runs each
 * through a fresh Gemini call with an extended schema, and writes results to
 * eval-football-filter.html at the repo root for human review.
 *
 * Run via: `npx tsx --env-file=.env src/evalFootballFilter.ts`
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

const SINCE = process.env.EVAL_SINCE ?? '2026-05-01T00:00:00Z';
const MAX_ARTICLES = Number(process.env.EVAL_MAX ?? 3000);
const FORCE = process.env.EVAL_FORCE === '1';
const PAGE_SIZE = 1000;
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 10);
const OUTPUT_PATH = resolve(__dirname, '../../../eval-football-filter.html');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const TOPIC_CATEGORIES = [
  'on_pitch',           // match reports, goals, tactics, injuries-from-play
  'transfer',           // transfers, contracts, signings
  'club_business',      // ownership, sackings, finances tied to a club
  'off_pitch_personal', // footballer's personal/legal/charity life
  'other_sport',        // tennis, F1, NFL, cricket, etc.
  'betting_odds',       // odds roundups, betting tips
  'listicle',           // generic top-N lists, often cross-sport
  'unrelated',          // genuinely off-topic
] as const;

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    is_football_news: {
      type: SchemaType.BOOLEAN,
      description:
        'True only if the PRIMARY subject of the article is football (the sport itself, its players, clubs, matches, transfers, or competitions). False if football is merely mentioned in passing, or the article is primarily about another sport, generic listicles, betting promos, or a footballer\'s purely off-pitch life.',
    },
    topic_category: {
      type: SchemaType.STRING,
      enum: [...TOPIC_CATEGORIES] as unknown as string[],
      description: 'Best-fit category for the article.',
    },
    reason: {
      type: SchemaType.STRING,
      description: 'One short sentence (under 25 words) explaining the verdict.',
    },
  },
  required: ['is_football_news', 'topic_category', 'reason'],
};

const SYSTEM_INSTRUCTION = `You are classifying football news for a strict football-only feed.

For each article, decide whether the article's PRIMARY subject is football. Be strict:
- An article that mentions a footballer or club but is primarily about another sport, business, lifestyle, or law: is_football_news = false.
- A betting-tips roundup or generic "top N athletes" listicle: is_football_news = false.
- An article about another sport: is_football_news = false.
- Match reports, transfers, club business decisions, manager moves, on-pitch incidents: is_football_news = true.
- Borderline: a footballer's off-pitch personal news (e.g. legal trouble, charity) — is_football_news = false unless it directly affects their playing status.

Pick the best topic_category. Give a one-sentence reason.`;

type Article = {
  id: string;
  url: string;
  publisher: string;
  headline: string;
  original_snippet: string | null;
  summary: string | null;
  published_at: string;
  entity_names: string[];
};

type Verdict = {
  is_football_news: boolean;
  topic_category: string;
  reason: string;
};

async function fetchSample(): Promise<Article[]> {
  const { count, error: countErr } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'summarized')
    .gte('summary_at', SINCE);

  if (countErr) throw new Error(`count: ${countErr.message}`);
  const total = count ?? 0;
  console.log(`[eval] ${total} articles since ${SINCE}`);

  if (total === 0) return [];
  if (total > MAX_ARTICLES && !FORCE) {
    throw new Error(
      `[eval] ${total} articles exceeds MAX_ARTICLES=${MAX_ARTICLES}. Set EVAL_FORCE=1 to override.`
    );
  }

  const articles: Article[] = [];
  for (let from = 0; from < total; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, total - 1);
    const { data, error } = await supabase
      .from('articles')
      .select('id, url, publisher, headline, original_snippet, summary, published_at')
      .eq('status', 'summarized')
      .gte('summary_at', SINCE)
      .order('published_at', { ascending: false })
      .range(from, to);

    if (error) throw new Error(`page ${from}-${to}: ${error.message}`);
    if (data) articles.push(...data.map((a) => ({ ...a, entity_names: [] as string[] })));
    console.log(`[eval] fetched ${articles.length}/${total}`);
  }

  // Attach existing entity names (paginate the IN query too)
  const ids = articles.map((a) => a.id);
  const aeRows: Array<{ article_id: string; entities: { name: string; type: string } | null }> = [];
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const { data, error } = await supabase
      .from('article_entities')
      .select('article_id, entities ( name, type )')
      .in('article_id', slice);
    if (error) {
      console.warn(`[eval] entity fetch failed for slice ${i}: ${error.message}`);
      continue;
    }
    if (data) aeRows.push(...(data as any));
  }

  const byArticle = new Map<string, string[]>();
  for (const row of aeRows ?? []) {
    const ent = (row as any).entities;
    if (!ent) continue;
    const list = byArticle.get((row as any).article_id) ?? [];
    list.push(`${ent.name} (${ent.type})`);
    byArticle.set((row as any).article_id, list);
  }
  for (const a of articles) a.entity_names = byArticle.get(a.id) ?? [];

  return articles;
}

async function classify(article: Article): Promise<Verdict | { error: string }> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema as any,
      temperature: 0.1,
      maxOutputTokens: 2000,
    },
  });

  const body = article.summary ?? article.original_snippet ?? '';
  const prompt = `Publisher: ${article.publisher}
Headline: ${article.headline}

Article excerpt:
${body}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return JSON.parse(text) as Verdict;
  } catch (e: any) {
    return { error: e.message ?? String(e) };
  }
}

async function runConcurrent<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
        process.stdout.write('.');
      }
    })
  );
  process.stdout.write('\n');
  return results;
}

function escape(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(
  rows: Array<{ article: Article; verdict: Verdict | { error: string } }>
): string {
  const total = rows.length;
  const errored = rows.filter((r) => 'error' in r.verdict).length;
  const ok = rows.filter((r) => !('error' in r.verdict)) as Array<{
    article: Article;
    verdict: Verdict;
  }>;
  const filtered = ok.filter((r) => !r.verdict.is_football_news);
  const passed = ok.filter((r) => r.verdict.is_football_news);

  const byPublisher = new Map<string, { total: number; filtered: number }>();
  for (const r of ok) {
    const cur = byPublisher.get(r.article.publisher) ?? { total: 0, filtered: 0 };
    cur.total += 1;
    if (!r.verdict.is_football_news) cur.filtered += 1;
    byPublisher.set(r.article.publisher, cur);
  }
  const byCategory = new Map<string, number>();
  for (const r of ok) {
    byCategory.set(r.verdict.topic_category, (byCategory.get(r.verdict.topic_category) ?? 0) + 1);
  }

  const pubRows = Array.from(byPublisher.entries())
    .sort((a, b) => b[1].filtered - a[1].filtered)
    .map(
      ([pub, s]) =>
        `<tr><td>${escape(pub)}</td><td>${s.total}</td><td class="${
          s.filtered > 0 ? 'bad' : ''
        }">${s.filtered}</td><td>${((s.filtered / s.total) * 100).toFixed(0)}%</td></tr>`
    )
    .join('');

  const catRows = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `<tr><td>${escape(cat)}</td><td>${n}</td></tr>`)
    .join('');

  // Render filtered first so reviewer sees them at the top
  const sorted = [
    ...filtered.sort((a, b) => a.article.publisher.localeCompare(b.article.publisher)),
    ...passed,
  ];

  const articleCards = sorted
    .map((r) => {
      if ('error' in r.verdict) {
        return `<div class="card err">
        <div class="head">${escape(r.article.publisher)} · ERROR</div>
        <div class="headline">${escape(r.article.headline)}</div>
        <div class="reason">${escape(r.verdict.error)}</div>
      </div>`;
      }
      const v = r.verdict;
      const cls = v.is_football_news ? 'pass' : 'filter';
      const label = v.is_football_news ? 'KEEP' : 'FILTER';
      const entityHtml =
        r.article.entity_names.length > 0
          ? `<div class="entities">${r.article.entity_names
              .map((e) => `<span class="ent">${escape(e)}</span>`)
              .join(' ')}</div>`
          : '<div class="entities none">no entities tagged</div>';
      return `<div class="card ${cls}">
      <div class="head">
        <span class="pub">${escape(r.article.publisher)}</span>
        <span class="badge ${cls}">${label}</span>
        <span class="cat">${escape(v.topic_category)}</span>
      </div>
      <a class="headline" href="${escape(r.article.url)}" target="_blank" rel="noreferrer">${escape(
        r.article.headline
      )}</a>
      <div class="snippet">${escape(r.article.summary ?? r.article.original_snippet ?? '')}</div>
      ${entityHtml}
      <div class="reason"><b>Verdict reason:</b> ${escape(v.reason)}</div>
    </div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Football filter eval</title>
<style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; margin: 24px; background: #f7f7f8; color: #111; }
  h1 { margin: 0 0 4px; }
  .meta { color: #666; margin-bottom: 24px; }
  .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .panel { background: white; border: 1px solid #e2e2e6; border-radius: 8px; padding: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 13px; }
  th { color: #555; font-weight: 600; }
  td.bad { color: #b00020; font-weight: 600; }
  .stats { display: flex; gap: 24px; margin-bottom: 16px; }
  .stat { background: white; border: 1px solid #e2e2e6; border-radius: 8px; padding: 12px 16px; }
  .stat .n { font-size: 24px; font-weight: 700; }
  .stat .l { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
  .card { background: white; border: 1px solid #e2e2e6; border-left-width: 4px; border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; }
  .card.filter { border-left-color: #b00020; background: #fff5f5; }
  .card.pass { border-left-color: #1f883d; }
  .card.err { border-left-color: #b58900; background: #fffaf0; }
  .head { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; font-size: 12px; color: #666; }
  .pub { font-weight: 600; color: #333; }
  .badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
  .badge.filter { background: #b00020; color: white; }
  .badge.pass { background: #1f883d; color: white; }
  .cat { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #eef; padding: 2px 6px; border-radius: 4px; }
  .headline { display: block; font-size: 15px; font-weight: 600; color: #111; text-decoration: none; margin-bottom: 4px; }
  .headline:hover { text-decoration: underline; }
  .snippet { color: #444; font-size: 13px; margin-bottom: 6px; }
  .entities { font-size: 12px; margin-bottom: 6px; }
  .entities.none { color: #999; font-style: italic; }
  .ent { display: inline-block; background: #eef; padding: 1px 6px; border-radius: 3px; margin-right: 3px; }
  .reason { font-size: 12px; color: #444; }
</style>
</head>
<body>
<h1>Football filter eval</h1>
<div class="meta">Model: ${escape(MODEL)} · Generated: ${new Date().toISOString()}</div>

<div class="stats">
  <div class="stat"><div class="n">${total}</div><div class="l">Articles tested</div></div>
  <div class="stat"><div class="n" style="color:#1f883d">${passed.length}</div><div class="l">Would keep</div></div>
  <div class="stat"><div class="n" style="color:#b00020">${filtered.length}</div><div class="l">Would filter</div></div>
  <div class="stat"><div class="n" style="color:#b58900">${errored}</div><div class="l">Errored</div></div>
  <div class="stat"><div class="n">${total === 0 ? 0 : ((filtered.length / total) * 100).toFixed(1)}%</div><div class="l">Filter rate</div></div>
</div>

<div class="summary">
  <div class="panel">
    <h3 style="margin-top:0">By publisher</h3>
    <table>
      <thead><tr><th>Publisher</th><th>Total</th><th>Filtered</th><th>%</th></tr></thead>
      <tbody>${pubRows}</tbody>
    </table>
  </div>
  <div class="panel">
    <h3 style="margin-top:0">By topic category</h3>
    <table>
      <thead><tr><th>Category</th><th>Count</th></tr></thead>
      <tbody>${catRows}</tbody>
    </table>
  </div>
</div>

<h2>Articles (filtered first)</h2>
${articleCards}
</body>
</html>`;
}

async function main() {
  console.log('[eval] fetching sample…');
  const articles = await fetchSample();
  console.log(`[eval] sampled ${articles.length} articles`);

  if (articles.length === 0) {
    console.error('[eval] no articles to evaluate — is the DB seeded?');
    process.exit(1);
  }

  console.log(`[eval] classifying with ${MODEL} (concurrency=${CONCURRENCY})…`);
  const verdicts = await runConcurrent(articles, classify, CONCURRENCY);

  const rows = articles.map((article, i) => ({ article, verdict: verdicts[i] }));
  const html = renderHtml(rows);
  writeFileSync(OUTPUT_PATH, html, 'utf8');
  console.log(`[eval] wrote ${OUTPUT_PATH}`);

  const filtered = rows.filter(
    (r) => !('error' in r.verdict) && !(r.verdict as Verdict).is_football_news
  ).length;
  const errored = rows.filter((r) => 'error' in r.verdict).length;
  console.log(
    `[eval] total=${rows.length} would_filter=${filtered} errored=${errored}`
  );
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
