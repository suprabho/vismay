/**
 * The slug rule `entities` rows from football-data.org are stored under.
 *
 * football-data.org stores official names ("Juventus FC", "SSC Napoli", "Bologna FC 1909"),
 * but news articles — and the LLM's extraction — use common names ("Juventus", "Napoli", "Bologna").
 * We strip club-type suffixes/prefixes and trailing founding years so the slug matches
 * what the resolver sees. The original name is preserved on `name` for display.
 *
 * Shared by seed.ts (the one-time seed) and competitionTeams.ts (the daily
 * top-up from the fixtures sync) — both must mint the same slug for the same
 * club, or the top-up would insert a duplicate of a seeded row.
 */

import { normalizeEntityKey } from '@footshorts/shared/entityKeys';

export function commonName(name: string): string {
  return name
    // Drop governing-body prefixes on league names
    .replace(/\b(UEFA|FIFA|CONMEBOL|CONCACAF|AFC Champions)\b/gi, '')
    // Drop club-type tokens anywhere in the name (case-insensitive: VfB, HSV, etc.).
    // Glued acronyms (ACF Fiorentina, Genoa CFC, Atalanta BC) need their own
    // entries — \b won't split them into AC/CF etc. Club-type words count too:
    // Calcio (Cagliari Calcio, Parma Calcio 1913) and US (US Sassuolo Calcio).
    .replace(/\b(FC|CFC|CF|CD|SSC|SS|AFC|ACF|AC|AS|RC|RCD|CALCIO|CA|SL|SC|BC|BK|IF|FK|NK|US|HSV|TSV|VFL|VFB|RB)\b/gi, '')
    // Drop leading "1. FC" / "1. FSV" style prefixes (German)
    .replace(/^\s*\d+\.\s*(FC|FSV|FCN)?\s*/i, '')
    // Drop trailing founding years
    .replace(/\b(18|19|20)\d{2}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `entities.slug` for a football-data.org team or competition name. */
export function entitySlug(name: string): string {
  return normalizeEntityKey(commonName(name));
}
