import { getCompetitionPalette } from '@vismay/footshorts-viz/native';
import type { FeedCardEntity } from '@footshorts/shared/schemas';

/**
 * Brand colour for an entity, matching `FeedCard`'s placeholder logic: the
 * seeded `primary_color` when we have one, otherwise the competition palette
 * for leagues. Teams without a colour return undefined and get the neutral
 * monogram treatment.
 */
export function entityColor(e: FeedCardEntity): string | undefined {
  if (e.primary_color) return e.primary_color;
  if (e.type === 'league') return getCompetitionPalette(e.slug);
  return undefined;
}

/**
 * The two clubs the card's colour band is drawn from — the highest-confidence
 * entities that have a brand colour at all.
 */
export function pickBandEntities(entities: FeedCardEntity[]): Array<{
  entity: FeedCardEntity;
  color: string;
}> {
  const picked: Array<{ entity: FeedCardEntity; color: string }> = [];
  for (const entity of entities) {
    const color = entityColor(entity);
    if (!color) continue;
    picked.push({ entity, color });
    if (picked.length === 2) break;
  }
  return picked;
}

function rgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Whether two club colours are too similar to split a band between.
 *
 * Exact-match dedupe isn't enough on real fixtures: Manchester United (#DA020E)
 * against Milan (#E5061C) are different values and the same red on screen, so
 * the diagonal disappears and the card reads as one flat fill. Channel weights
 * approximate the eye's green bias; the threshold sits above a red-vs-red pair
 * and well below a genuine contrast like Newcastle against Liverpool.
 */
const BAND_MIN_CONTRAST = 90;

export function colorsTooClose(a: string, b: string): boolean {
  const x = rgb(a);
  const y = rgb(b);
  // Anything we can't parse (a theme `rgb()` string, a named colour) is
  // assumed distinct rather than silently collapsing the band.
  if (!x || !y) return false;
  const distance = Math.sqrt(
    2 * (x[0] - y[0]) ** 2 + 4 * (x[1] - y[1]) ** 2 + 3 * (x[2] - y[2]) ** 2,
  );
  return distance < BAND_MIN_CONTRAST;
}

/**
 * Three-letter monogram for a club with no crest asset — "Liverpool" → LIV,
 * "Manchester City" → MCI. Multi-word names take one letter per word so the
 * initials stay distinguishable, which single-word truncation doesn't manage
 * for e.g. Manchester United vs Manchester City.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const [first] = words;
  if (!first) return '?';
  if (words.length === 1) return first.slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w.charAt(0))
    .join('')
    .toUpperCase();
}

/**
 * Compact relative timestamp for the card's byline. Local to the landing so
 * the screen stays independent of the feed components, which pull in the
 * router and safe-area context this screen renders without.
 */
export function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
