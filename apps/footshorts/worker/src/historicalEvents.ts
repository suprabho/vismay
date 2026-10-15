/**
 * Layer 2 of the football-seasons workspace: Claude reads a season's Wikipedia
 * articles (prepared by `scripts/events.py text`) and extracts dated events in one
 * fixed format. Every event must carry `evidence` — a verbatim fragment of the
 * article — and is dropped unless that fragment is actually in the text, so a
 * hallucinated event can't reach events.csv. The hand check comes after this.
 *
 * Results are cached per article (raw/events_llm/<season>/<article>.json); rerun
 * freely, pass --force to re-extract. Local files only; no database writes.
 *
 *   pnpm history:events -- --season=2003 [--dir=vizmaya-data/football-seasons] [--only=Arsenal] [--force]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { generateText } from '@vismay/ai-gateway';

const DEFAULT_DIR = resolve(import.meta.dirname, '../../../../vizmaya-data/football-seasons');
const MODEL = 'text.sonnet';
const CHUNK_CHARS = 24_000;

export const EVENT_TYPES = ['transfer', 'manager_change', 'injury', 'suspension', 'controversy', 'ownership', 'finance',
  'match', 'record', 'award', 'international', 'off_field', 'other'] as const;

const eventSchema = z.object({
  date: z.string().describe('YYYY-MM-DD, or YYYY-MM when the text gives only the month'),
  type: z.enum(EVENT_TYPES),
  competition: z.string().describe('e.g. "Premier League", "Champions League", "UEFA Euro 2004"; "" if none'),
  teams: z.array(z.string()).describe('club or national-team names as written in the text'),
  people: z.array(z.string()).describe('full names of the people the event is about'),
  summary: z.string().describe('one neutral line, ≤ 25 words, nothing the text does not say'),
  evidence: z.string().describe('8–40 words copied EXACTLY from the text that state this event (no paraphrase, no ⟨url⟩ markers)'),
  source_url: z.string().describe('the ⟨url⟩ citation that follows the evidence sentence, without the brackets; "" if none'),
  importance: z.number().int().min(1).max(3).describe('3 = would open a chapter, 2 = notable, 1 = minor'),
});
type Event = z.infer<typeof eventSchema>;

const SYSTEM = `You extract dated events from Wikipedia text for a narrative history of one football season.
Rules:
- Only events the text explicitly states AND dates (day or month). If the date isn't in the text, skip the event — never infer one.
- Use the season window you are given; skip anything outside it.
- Skip routine match results unless the text singles the match out (a record, a famous comeback, a final, a brawl, a title decided).
- One event per real-world happening; don't repeat it in different words.
- evidence must be copied character-for-character from the text: an 8–40 word span. It is checked by exact string match.
- summary is plain and neutral. Don't add adjectives, motives, or facts the text doesn't give.`;

type Manifest = { season: string; start: number; window: [string, string]; pages: { title: string; kind: string; url: string; file: string }[] };

/** Paragraph-aligned chunks so a fact and its citation stay together. */
function chunks(text: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const para of text.split(/\n\n+/)) {
    if (cur && cur.length + para.length > CHUNK_CHARS) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + para;
  }
  if (cur) out.push(cur);
  return out;
}

/** The model sometimes writes non-ASCII as literal escape text ("\\u00a3175" for "£175"). */
const unescape = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const clean = (e: Event): Event => ({ ...e, summary: unescape(e.summary), evidence: unescape(e.evidence), competition: unescape(e.competition),
  teams: e.teams.map(unescape), people: e.people.map(unescape) });

/** Comparable form: no citation markers, unified quotes/dashes, single spaces. */
const norm = (s: string) => s.replace(/⟨[^⟩]*⟩/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ').trim().toLowerCase();

function inWindow(date: string, [from, to]: [string, string]) {
  return /^\d{4}-\d{2}(-\d{2})?$/.test(date) && date >= from.slice(0, date.length) && date <= to.slice(0, date.length);
}

async function main() {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const ok = args.every(a => a === '--force' || /^--(season|dir|only)=/.test(a));
  const season = Number(args.find(a => a.startsWith('--season='))?.slice(9));
  if (!ok || !Number.isInteger(season)) throw new Error('Usage: history:events -- --season=2003 [--dir=path] [--only=substring] [--force]');
  const dir = resolve(args.find(a => a.startsWith('--dir='))?.slice(6) ?? DEFAULT_DIR);
  const only = args.find(a => a.startsWith('--only='))?.slice(7);
  const label = `${season}-${String(season + 1).slice(2)}`;
  const textDir = join(dir, 'raw/wikipedia_text', label);
  const outDir = join(dir, 'raw/events_llm', label);
  mkdirSync(outDir, { recursive: true });
  const manifest: Manifest = JSON.parse(readFileSync(join(textDir, 'manifest.json'), 'utf8'));

  let kept = 0, dropped = 0, cached = 0, tokens = 0;
  for (const page of manifest.pages) {
    if (only && !page.title.includes(only)) continue;
    const outFile = join(outDir, page.file.replace(/\.txt$/, '.json'));
    if (existsSync(outFile) && !args.includes('--force')) { cached++; continue; }
    const text = readFileSync(join(textDir, page.file), 'utf8');
    const events: (Event & { chunk: number })[] = [];
    const rejected: (Event & { reason: string })[] = [];
    for (const [i, chunk] of chunks(text).entries()) {
      const { result, usage } = await generateText({
        model: MODEL,
        system: SYSTEM,
        prompt: `Season ${label}; window ${manifest.window[0]} to ${manifest.window[1]}.\nArticle: "${page.title}" (${page.kind}).\n\n<text>\n${chunk}\n</text>`,
        schema: z.object({ events: z.array(eventSchema) }),
        maxOutputTokens: 12_000,
        metadata: { 'x-feature': 'football-seasons-events' },
      });
      tokens += usage?.total ?? 0;
      const hay = norm(chunk);
      for (const e of result.events.map(clean)) {
        const reason = !norm(e.evidence) || !hay.includes(norm(e.evidence)) ? 'evidence not found verbatim'
          : !inWindow(e.date, manifest.window) ? 'date outside season window'
          : e.source_url && !chunk.includes(e.source_url) ? 'source_url not in text' : '';
        if (reason) rejected.push({ ...e, reason });
        else events.push({ ...e, chunk: i });
      }
    }
    writeFileSync(outFile, JSON.stringify({ title: page.title, url: page.url, kind: page.kind, model: MODEL, events, rejected }, null, 1));
    kept += events.length; dropped += rejected.length;
    console.log(`${page.title}: ${events.length} events${rejected.length ? `, ${rejected.length} rejected` : ''}`);
  }
  console.log(JSON.stringify({ season: label, kept, rejected: dropped, cachedArticles: cached, tokens }));
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Extraction failed'); process.exitCode = 1; });
