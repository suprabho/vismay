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

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

/**
 * Pick the dominant color from a raw RGBA pixel buffer. We:
 *  - Skip fully/mostly-transparent pixels (crests often have alpha cutouts).
 *  - Bucket colors into 5-bit-per-channel bins (32³ = 32k buckets) and count.
 *  - Rank buckets by count, but down-weight near-white and near-black so a
 *    brand color wins over the page/transparent-fill color.
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

  let best: { r: number; g: number; b: number; score: number } | null = null;
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

    // Favor saturated, frequent colors.
    const score = v.n * (0.3 + saturation);
    if (!best || score > best.score) best = { r, g, b, score };
  }

  if (!best) return null;
  return toHex(Math.round(best.r), Math.round(best.g), Math.round(best.b));
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
