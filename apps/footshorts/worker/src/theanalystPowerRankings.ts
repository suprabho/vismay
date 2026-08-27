/**
 * Weekly Opta Power Rankings ingest (theanalyst.com).
 *
 * Fetches the Power Rankings article, parses the ranked team list
 * deterministically (theanalyst/powerRankings.ts), resolves team names to our
 * canonical entities, summarizes the article prose with Gemini (we never store
 * the full text — attribution policy, see docs/theanalyst-scraping.md), and
 * inserts a status='draft' row into `power_rankings` for editorial review in
 * the admin app. Nothing is auto-published: an editor flips the row to
 * 'published' from the admin Power rankings tab.
 *
 * Dedupe: sha256 of (ranked list + narrative source text) compared against the
 * latest row for the same source_url — unchanged content is skipped, so the
 * weekly cron can safely run more often than theanalyst publishes.
 *
 * Usage:
 *   npm run power-rankings                 # default article URL
 *   npm run power-rankings -- --url=https://theanalyst.com/articles/<slug>
 *   npm run power-rankings -- --dry        # fetch + parse + print, no insert
 *
 * Gemini is optional here (like recap.ts): without GEMINI_API_KEY the draft
 * still lands, with narrative=null, and the editor writes their own.
 */

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchPowerRankings, RankingEntry } from './theanalyst/powerRankings';
import { closeBrowser } from './theanalyst/fetch';
import { resolveTeamName } from './entityResolver';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';

const DEFAULT_URL =
  'https://theanalyst.com/articles/who-are-the-best-football-team-in-the-world-opta-power-rankings';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

function parseArgs(argv: string[]): { url: string; dry: boolean } {
  let url = DEFAULT_URL;
  let dry = false;
  for (const a of argv) {
    if (a.startsWith('--url=')) url = a.slice('--url='.length);
    else if (a === '--dry') dry = true;
    else console.warn(`[power-rankings] ignoring unknown arg: ${a}`);
  }
  return { url, dry };
}

/** ISO-8601 week label, e.g. "2026-W35". */
function isoWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of the current week decides the ISO year.
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function summarizeNarrative(title: string, narrativeText: string): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.log('[power-rankings] GEMINI_API_KEY not set — storing draft without narrative');
    return null;
  }
  const model = new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
  });
  const prompt = `The text below is the prose from The Analyst's weekly "Opta Power Rankings" football article titled "${title}". Write a neutral, factual 80-100 word summary of the week's headline movements and the reasoning the article gives. Lead with the most notable change. No opinion, no preamble, do not mention that this is a summary.

${narrativeText.slice(0, 20000)}`;
  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  return text || null;
}

async function resolveRankingEntities(rankings: RankingEntry[]): Promise<RankingEntry[]> {
  const out: RankingEntry[] = [];
  for (const entry of rankings) {
    out.push({
      ...entry,
      resolved_entity_id: await resolveTeamName(supabase, entry.team_name),
    });
  }
  return out;
}

async function run() {
  const { url, dry } = parseArgs(process.argv.slice(2));
  console.log(`[power-rankings] fetching ${url}`);

  const page = await fetchPowerRankings(url);
  console.log(`[power-rankings] parsed ${page.rankings.length} ranked teams from "${page.title}"`);

  // Hash the source content (pre-entity-resolution, pre-Gemini) so the dedupe
  // key only changes when theanalyst's content does.
  const contentHash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify(page.rankings.map(({ rank, team_name, score, movement }) => ({ rank, team_name, score, movement })))
    )
    .update(page.narrativeText)
    .digest('hex');

  const { data: latest } = await supabase
    .from('power_rankings')
    .select('id, content_hash, scraped_at')
    .eq('source_url', url)
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.content_hash === contentHash) {
    console.log(`[power-rankings] unchanged since ${latest.scraped_at} — skipping insert`);
    return;
  }

  const rankings = await resolveRankingEntities(page.rankings);
  const unresolved = rankings.filter((r) => !r.resolved_entity_id).length;
  if (unresolved > 0) {
    console.log(`[power-rankings] ${unresolved}/${rankings.length} team names unresolved — fixable in the admin before publish`);
  }

  const narrative = await summarizeNarrative(page.title, page.narrativeText);
  const weekLabel = isoWeekLabel(page.publishedAt ? new Date(page.publishedAt) : new Date());

  if (dry) {
    console.log(JSON.stringify({ weekLabel, narrative, rankings }, null, 2));
    console.log('[power-rankings] --dry: not writing to Supabase');
    return;
  }

  const { error } = await supabase.from('power_rankings').insert({
    source_url: url,
    week_label: weekLabel,
    rankings,
    narrative,
    content_hash: contentHash,
    status: 'draft',
  });
  if (error) throw new Error(`power_rankings insert failed: ${error.message}`);

  console.log(`[power-rankings] draft inserted for ${weekLabel} — review it in the admin Power rankings tab`);
}

run()
  .then(() => closeBrowser())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e);
    closeBrowser().finally(() => process.exit(1));
  });
