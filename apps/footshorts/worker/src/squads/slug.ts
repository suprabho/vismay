/**
 * Slug helpers for squad ingest. Mirrors seed.ts conventions so the player
 * slugs we mint are consistent with team/league slugs already in `entities`.
 */

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
