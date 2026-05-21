/**
 * Extract the dominant color from each entity's crest_url and store it in
 * entities.primary_color. Only fills rows where primary_color is null, so
 * repeat runs are cheap.
 *
 * Run via: npm run backfill:colors
 */

import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
  auth: { persistSession: false },
});

const SAMPLE_SIZE = 64;
// White text sits on top of this color in the UI (MatchTile etc.), so the
// chosen color must clear WCAG AA body-text contrast (4.5:1) against #FFFFFF.
const MIN_CONTRAST = 4.5;

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

// White has relative luminance 1, so contrast simplifies to 1.05 / (L + 0.05).
function contrastWithWhite(r: number, g: number, b: number): number {
  return 1.05 / (relativeLuminance(r, g, b) + 0.05);
}

// Scale RGB toward black (preserving hue) until the result clears `minContrast`
// against white. Binary-searches the largest scale factor that still passes —
// i.e. the lightest possible darkening — so the brand color stays recognizable.
function darkenToContrast(
  r: number,
  g: number,
  b: number,
  minContrast: number,
): { r: number; g: number; b: number } {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastWithWhite(r * mid, g * mid, b * mid) >= minContrast) lo = mid;
    else hi = mid;
  }
  return { r: r * lo, g: g * lo, b: b * lo };
}

/**
 * Pick the dominant color from a raw RGBA pixel buffer. We:
 *  - Skip fully/mostly-transparent pixels (crests often have alpha cutouts).
 *  - Bucket colors into 5-bit-per-channel bins (32³ = 32k buckets) and count.
 *  - Rank buckets by `count * (0.3 + saturation)` so a brand color wins over
 *    the page/transparent-fill color.
 *  - Prefer the highest-ranked bucket whose contrast against white already
 *    meets MIN_CONTRAST (e.g. Brazil → blue secondary instead of yellow).
 *  - If no bucket qualifies, darken the top-ranked bucket toward black until
 *    it does, preserving hue so the brand identity is still recognizable.
 */
function dominantColor(data: Buffer, channels: number): string | null {
  const counts = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i + channels <= data.length; i += channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = channels === 4 ? data[i + 3]! : 255;
    if (a < 200) continue;

    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const slot = counts.get(key);
    if (slot) {
      slot.r += r;
      slot.g += g;
      slot.b += b;
      slot.n += 1;
    } else {
      counts.set(key, { r, g, b, n: 1 });
    }
  }

  type Candidate = { r: number; g: number; b: number; score: number };
  const candidates: Candidate[] = [];
  for (const v of counts.values()) {
    const r = v.r / v.n;
    const g = v.g / v.n;
    const b = v.b / v.n;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const isNearWhite = min > 230;
    const isNearBlack = max < 30;
    if (isNearWhite || isNearBlack) continue;

    candidates.push({ r, g, b, score: v.n * (0.3 + saturation) });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    if (contrastWithWhite(c.r, c.g, c.b) >= MIN_CONTRAST) {
      return toHex(Math.round(c.r), Math.round(c.g), Math.round(c.b));
    }
  }

  const top = candidates[0]!;
  const d = darkenToContrast(top.r, top.g, top.b, MIN_CONTRAST);
  return toHex(Math.round(d.r), Math.round(d.g), Math.round(d.b));
}

async function extractColor(url: string): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const { data, info } = await sharp(buf)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  return dominantColor(data, info.channels);
}

async function run() {
  const force = process.argv.includes('--force');

  let query = supabase.from('entities').select('id, slug, name, crest_url, primary_color');
  if (!force) query = query.is('primary_color', null);
  query = query.not('crest_url', 'is', null);

  const { data: rows, error } = await query;
  if (error) throw error;

  console.log(`[colors] processing ${rows?.length ?? 0} entities${force ? ' (force)' : ''}`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    if (!row.crest_url) {
      skipped++;
      continue;
    }
    try {
      const color = await extractColor(row.crest_url);
      if (!color) {
        skipped++;
        console.log(`[colors] ${row.slug}: no dominant color`);
        continue;
      }
      const { error: uErr } = await supabase
        .from('entities')
        .update({ primary_color: color })
        .eq('id', row.id);
      if (uErr) {
        failed++;
        console.error(`[colors] ${row.slug}: update failed — ${uErr.message}`);
        continue;
      }
      updated++;
      console.log(`[colors] ${row.slug}: ${color}`);
    } catch (e) {
      failed++;
      console.error(`[colors] ${row.slug}: ${(e as Error).message}`);
    }
  }

  console.log(`[colors] done: updated=${updated} skipped=${skipped} failed=${failed}`);
}

run().catch((e) => {
  console.error('[colors] fatal:', e);
  process.exit(1);
});
