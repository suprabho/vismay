/**
 * Dedupe epstein_people / epstein_locations / epstein_events rows that
 * refer to the same real-world entity under different names (misspellings,
 * partial names, OCR misreads).
 *
 * Uses Gemini to cluster rows, then merges duplicates into a canonical row:
 *   - Sums mention_count
 *   - Repoints epstein_mentions.entity_id → canonical id
 *   - Deletes duplicate rows
 *   - Sets canonical_name on the survivor
 *
 * Locations are handled conservatively — we do NOT merge genuinely distinct
 * places like "Southern District of New York" vs "New York". That kind of
 * coarse rollup is the geocoder's job via ALIASES.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/epstein/dedupe-entities.ts           # dry run
 *   npx tsx --env-file=.env scripts/epstein/dedupe-entities.ts --apply   # write changes
 */

import { createServiceClient } from "../../lib/supabase";

type EntityKind = "person" | "location" | "event";

interface EntityRow {
  id: string;
  name: string;
  mention_count: number;
}

interface Cluster {
  canonical_name: string;
  members: string[]; // row names
}

const PERSON_PROMPT = `You are cleaning a messy extracted-entity list of PEOPLE from Jeffrey Epstein case documents. Some rows are the same person under different spellings (e.g. "Ghislane Maxwell" vs "Ghislaine Maxwell"), partial forms (e.g. "Epstein" vs "Jeffrey Epstein"), or OCR misreads ("RICKARD LAN" and "RICHARD LANGNORTH" are likely the same handwritten name).

Group rows that clearly refer to the same real person. Pick a canonical name — prefer the most complete/correctly-spelled form. Skip singletons.

Output ONLY valid JSON (no markdown fences) in this exact shape:
{
  "clusters": [
    { "canonical_name": "Ghislaine Maxwell", "members": ["Ghislane Maxwell", "Ghislaine Maxwell"] },
    { "canonical_name": "Jeffrey Epstein", "members": ["Epstein", "Jeffrey Epstein"] }
  ]
}

Be conservative: do NOT merge different real people even if their names are similar. Only merge rows you are confident refer to the same person.`;

const LOCATION_PROMPT = `You are cleaning a messy extracted-entity list of LOCATIONS from Jeffrey Epstein case documents. Merge rows that refer to the exact same place under different spellings or formatting (e.g. "NY" vs "New York" vs "New York, NY").

IMPORTANT: Do NOT merge places that are semantically different even if related. Specifically:
- Any SPECIFIC STREET ADDRESS is its own entity — do NOT merge with the city/country it sits in (e.g. "935 Pennsylvania Ave NW, Washington D.C." is NOT a duplicate of "Washington, D.C.")
- Judicial districts stand alone (e.g. "Southern District of New York" is NOT "New York")
- Different granularities are different entities ("Manhattan" vs "New York", "Palm Beach" vs "Florida")
Only merge true duplicates: spelling variants, casing differences, or formatting-only differences of the exact same place.

Output ONLY valid JSON (no markdown fences):
{
  "clusters": [
    { "canonical_name": "...", "members": ["...", "..."] }
  ]
}`;

const EVENT_PROMPT = `You are cleaning a messy extracted-entity list of EVENTS from Jeffrey Epstein case documents. Merge rows that refer to the same event under different phrasings (e.g. "2008 plea deal" vs "Epstein plea agreement 2008").

Output ONLY valid JSON (no markdown fences):
{
  "clusters": [
    { "canonical_name": "...", "members": ["...", "..."] }
  ]
}

Be conservative: only merge when clearly the same event.`;

async function clusterWithGemini(prompt: string, rows: EntityRow[]): Promise<Cluster[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const { GoogleGenAI } = await import("@google/genai");
  const genai = new GoogleGenAI({ apiKey });

  const rowsJson = JSON.stringify(
    rows.map((r) => ({ name: r.name, mention_count: r.mention_count })),
    null,
    2
  );

  const res = await genai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: `${prompt}\n\nHere are the rows:\n\n${rowsJson}`,
  });
  const text = res.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { clusters: Cluster[] };
    return parsed.clusters ?? [];
  } catch (err) {
    console.warn(`  Failed to parse Gemini response: ${(err as Error).message}`);
    return [];
  }
}

function pickCanonical(rows: EntityRow[], canonicalName: string): EntityRow {
  // Prefer a row whose name matches canonical_name exactly (case-insensitive);
  // otherwise pick the row with the highest mention_count, tiebreak on longer name.
  const exact = rows.find((r) => r.name.toLowerCase() === canonicalName.toLowerCase());
  if (exact) return exact;
  return [...rows].sort((a, b) => {
    if (b.mention_count !== a.mention_count) return b.mention_count - a.mention_count;
    return b.name.length - a.name.length;
  })[0];
}

async function dedupeTable(
  kind: EntityKind,
  table: string,
  prompt: string,
  apply: boolean
) {
  const supabase = createServiceClient();
  console.log(`\n=== ${kind.toUpperCase()} (${table}) ===`);

  const { data: rows, error } = await supabase
    .from(table)
    .select("id, name, mention_count");

  if (error) { console.error(error.message); return; }
  if (!rows?.length) { console.log("  (no rows)"); return; }

  console.log(`  ${rows.length} rows → asking Gemini to cluster`);
  const clusters = await clusterWithGemini(prompt, rows as EntityRow[]);

  if (!clusters.length) { console.log("  No duplicates found."); return; }

  const byName = new Map<string, EntityRow>();
  for (const r of rows as EntityRow[]) byName.set(r.name.toLowerCase(), r);

  let merges = 0;
  for (const cluster of clusters) {
    const memberRows = cluster.members
      .map((n) => byName.get(n.toLowerCase()))
      .filter((r): r is EntityRow => !!r);
    if (memberRows.length < 2) continue;

    const canonical = pickCanonical(memberRows, cluster.canonical_name);
    const duplicates = memberRows.filter((r) => r.id !== canonical.id);
    if (!duplicates.length) continue;

    const summedMentions = memberRows.reduce((s, r) => s + (r.mention_count ?? 0), 0);

    console.log(`\n  → "${cluster.canonical_name}" (keep ${canonical.name}, merge ${duplicates.length})`);
    for (const d of duplicates) console.log(`      - "${d.name}" (mentions=${d.mention_count})`);
    console.log(`     canonical mention_count: ${canonical.mention_count} → ${summedMentions}`);

    if (!apply) { merges++; continue; }

    // 1. Repoint mentions for each duplicate id
    for (const dup of duplicates) {
      const { error: mentionErr } = await supabase
        .from("epstein_mentions")
        .update({ entity_id: canonical.id })
        .eq("entity_type", kind)
        .eq("entity_id", dup.id);
      if (mentionErr) {
        console.warn(`      mentions repoint failed for ${dup.name}: ${mentionErr.message}`);
        continue;
      }
    }

    // 2. Update canonical row.
    // Only epstein_locations has the canonical_name column (per migration 002).
    const canonicalUpdate: Record<string, unknown> = {
      mention_count: summedMentions,
    };
    if (kind === "location") canonicalUpdate.canonical_name = cluster.canonical_name;

    const { error: updErr } = await supabase
      .from(table)
      .update(canonicalUpdate)
      .eq("id", canonical.id);
    if (updErr) console.warn(`      canonical update failed: ${updErr.message}`);

    // 3. Delete duplicate rows
    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .in("id", duplicates.map((d) => d.id));
    if (delErr) console.warn(`      delete failed: ${delErr.message}`);

    merges++;
  }

  console.log(`\n  ${apply ? "Merged" : "Would merge"} ${merges} cluster(s).`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const onlyArg = process.argv.find((a) => a.startsWith("--only="))?.split("=")[1];
  const only = onlyArg ? new Set(onlyArg.split(",")) : null;

  console.log(apply ? "MODE: APPLY (writing changes)" : "MODE: DRY-RUN (no writes)");
  if (only) console.log(`FILTER: only ${[...only].join(", ")}`);

  const run = (k: EntityKind) => !only || only.has(k);

  // epstein_people + epstein_locations have canonical_name column; events don't.
  if (run("person")) await dedupeTable("person", "epstein_people", PERSON_PROMPT, apply);
  if (run("location")) await dedupeTable("location", "epstein_locations", LOCATION_PROMPT, apply);
  if (run("event")) await dedupeTable("event", "epstein_events", EVENT_PROMPT, apply);
}

main().catch((e) => { console.error(e); process.exit(1); });
