/**
 * HTML report renderer. Mirrors the visual language of
 * apps/footshorts/worker/src/evalFootballFilter.ts so reviewers see a
 * consistent look across all eval reports.
 *
 * Article cards are sorted worst-first (most spurious+missing on top) so the
 * reviewer's eye lands on real problems immediately.
 */

import type { ArticleResult, Metrics } from './types';

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function renderHtml(opts: {
  appName: string;
  judgeModel: string;
  since: string;
  results: ArticleResult[];
  metrics: Metrics;
}): string {
  const { appName, judgeModel, since, results, metrics } = opts;

  const typeRows = Object.entries(metrics.byType)
    .sort((a, b) => b[1].support - a[1].support)
    .map(
      ([t, m]) =>
        `<tr><td>${esc(t)}</td><td>${m.support}</td><td>${pct(m.precision)}</td><td>${pct(
          m.recall
        )}</td><td>${pct(m.f1)}</td><td>${m.spurious}</td><td>${m.missing}</td></tr>`
    )
    .join('');

  const pubRows = metrics.byPublisher
    .map(
      (p) =>
        `<tr><td>${esc(p.publisher)}</td><td>${p.articles}</td><td class="${
          p.spurious > 0 ? 'bad' : ''
        }">${p.spurious}</td><td class="${p.missing > 0 ? 'bad' : ''}">${p.missing}</td></tr>`
    )
    .join('');

  // Sort articles worst-first: errors top, then by spurious+missing desc.
  const sorted = [...results].sort((a, b) => {
    const aErr = 'error' in a.verdict ? 1 : 0;
    const bErr = 'error' in b.verdict ? 1 : 0;
    if (aErr !== bErr) return bErr - aErr;
    const aScore = 'error' in a.verdict ? 0 : a.verdict.spurious.length + a.verdict.missing.length;
    const bScore = 'error' in b.verdict ? 0 : b.verdict.spurious.length + b.verdict.missing.length;
    return bScore - aScore;
  });

  const cards = sorted
    .map((r) => {
      const { article } = r;
      if ('error' in r.verdict) {
        return `<div class="card err">
        <div class="head"><span class="pub">${esc(article.publisher)}</span><span class="badge err">ERROR</span></div>
        <a class="headline" href="${esc(article.url)}" target="_blank" rel="noreferrer">${esc(article.headline)}</a>
        <div class="reason">${esc(r.verdict.error)}</div>
      </div>`;
      }
      const v = r.verdict;
      const badness = v.spurious.length + v.missing.length;
      const cls = badness === 0 ? 'pass' : badness <= 1 ? 'warn' : 'bad';
      const label = badness === 0 ? 'CLEAN' : `${v.spurious.length}↑ ${v.missing.length}↓`;

      const taggedHtml =
        article.taggedEntities.length === 0
          ? '<span class="ent none">(no tags)</span>'
          : article.taggedEntities
              .map((e) => {
                const wrong = v.spurious.find((s) => s.name === e.name && s.type === e.type);
                const cls = wrong ? 'ent spurious' : 'ent';
                const title = wrong ? ` title="${esc(wrong.reason)}"` : '';
                return `<span class="${cls}"${title}>${esc(e.name)} <span class="ent-t">[${esc(e.type)}]</span></span>`;
              })
              .join(' ');

      const missingHtml =
        v.missing.length === 0
          ? ''
          : `<div class="missing-row"><span class="lbl">missing:</span> ${v.missing
              .map(
                (m) =>
                  `<span class="ent missing" title="${esc(m.reason)}">${esc(m.name)} <span class="ent-t">[${esc(m.type)}]</span></span>`
              )
              .join(' ')}</div>`;

      return `<div class="card ${cls}">
      <div class="head">
        <span class="pub">${esc(article.publisher)}</span>
        <span class="badge ${cls}">${label}</span>
        <span class="meta">${esc(new Date(article.publishedAt).toISOString().slice(0, 10))}</span>
      </div>
      <a class="headline" href="${esc(article.url)}" target="_blank" rel="noreferrer">${esc(article.headline)}</a>
      <div class="snippet">${esc(article.body)}</div>
      <div class="tagged-row"><span class="lbl">tagged:</span> ${taggedHtml}</div>
      ${missingHtml}
      <div class="notes">${esc(v.notes)}</div>
    </div>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Entity tag eval · ${esc(appName)}</title>
<style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; margin: 24px; background: #f7f7f8; color: #111; }
  h1 { margin: 0 0 4px; }
  .meta { color: #666; margin-bottom: 24px; font-size: 12px; }
  .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .panel { background: white; border: 1px solid #e2e2e6; border-radius: 8px; padding: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; font-size: 13px; }
  th { color: #555; font-weight: 600; }
  td.bad { color: #b00020; font-weight: 600; }
  .stats { display: flex; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
  .stat { background: white; border: 1px solid #e2e2e6; border-radius: 8px; padding: 12px 16px; }
  .stat .n { font-size: 24px; font-weight: 700; }
  .stat .l { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.04em; }
  .card { background: white; border: 1px solid #e2e2e6; border-left-width: 4px; border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; }
  .card.pass { border-left-color: #1f883d; }
  .card.warn { border-left-color: #b58900; background: #fffaf0; }
  .card.bad { border-left-color: #b00020; background: #fff5f5; }
  .card.err { border-left-color: #6b21a8; background: #faf5ff; }
  .head { display: flex; gap: 10px; align-items: center; margin-bottom: 6px; font-size: 12px; color: #666; }
  .pub { font-weight: 600; color: #333; }
  .meta { color: #999; font-size: 11px; }
  .badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; }
  .badge.pass { background: #1f883d; color: white; }
  .badge.warn { background: #b58900; color: white; }
  .badge.bad { background: #b00020; color: white; }
  .badge.err { background: #6b21a8; color: white; }
  .headline { display: block; font-size: 15px; font-weight: 600; color: #111; text-decoration: none; margin-bottom: 4px; }
  .headline:hover { text-decoration: underline; }
  .snippet { color: #444; font-size: 13px; margin-bottom: 8px; }
  .tagged-row, .missing-row { font-size: 12px; margin-bottom: 4px; }
  .lbl { color: #666; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; margin-right: 4px; }
  .ent { display: inline-block; background: #eef; padding: 1px 6px; border-radius: 3px; margin-right: 3px; margin-bottom: 2px; }
  .ent.none { background: transparent; color: #999; font-style: italic; }
  .ent.spurious { background: #fee; color: #b00020; text-decoration: line-through; cursor: help; }
  .ent.missing { background: #efe; color: #1f883d; cursor: help; }
  .ent-t { color: #888; font-size: 10px; }
  .notes { font-size: 12px; color: #555; font-style: italic; margin-top: 4px; }
  .reason { font-size: 12px; color: #b00020; }
</style>
</head>
<body>
<h1>Entity tag eval · ${esc(appName)}</h1>
<div class="meta">Judge: ${esc(judgeModel)} · Since: ${esc(since)} · Generated: ${new Date().toISOString()}</div>

<div class="stats">
  <div class="stat"><div class="n">${metrics.articles}</div><div class="l">Articles</div></div>
  <div class="stat"><div class="n">${pct(metrics.totals.precision)}</div><div class="l">Precision</div></div>
  <div class="stat"><div class="n">${pct(metrics.totals.recall)}</div><div class="l">Recall</div></div>
  <div class="stat"><div class="n">${pct(metrics.totals.f1)}</div><div class="l">F1</div></div>
  <div class="stat"><div class="n" style="color:#1f883d">${metrics.totals.correct}</div><div class="l">Correct</div></div>
  <div class="stat"><div class="n" style="color:#b00020">${metrics.totals.spurious}</div><div class="l">Spurious</div></div>
  <div class="stat"><div class="n" style="color:#b00020">${metrics.totals.missing}</div><div class="l">Missing</div></div>
  <div class="stat"><div class="n" style="color:#6b21a8">${metrics.errored}</div><div class="l">Errored</div></div>
</div>

<div class="summary">
  <div class="panel">
    <h3 style="margin-top:0">By entity type</h3>
    <table>
      <thead><tr><th>Type</th><th>Support</th><th>Precision</th><th>Recall</th><th>F1</th><th>Spurious</th><th>Missing</th></tr></thead>
      <tbody>${typeRows}</tbody>
    </table>
  </div>
  <div class="panel">
    <h3 style="margin-top:0">By publisher</h3>
    <table>
      <thead><tr><th>Publisher</th><th>Articles</th><th>Spurious</th><th>Missing</th></tr></thead>
      <tbody>${pubRows}</tbody>
    </table>
  </div>
</div>

<h2>Articles (worst first)</h2>
${cards}
</body>
</html>`;
}
