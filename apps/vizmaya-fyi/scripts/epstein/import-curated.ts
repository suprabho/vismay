/**
 * Import curated Epstein network data from
 *   https://github.com/dleerdefi/epstein-network-data
 *
 * Expects a local checkout of that repo. Pass --repo-path to point at it.
 *
 *   pnpm add csv-parse              # one-time dependency
 *   pnpm epstein:import-curated --repo-path ../epstein-network-data
 *   pnpm epstein:import-curated --repo-path ../epstein-network-data --only airports,flights
 *   pnpm epstein:import-curated --repo-path ../epstein-network-data --dry-run
 *
 * Idempotent: upserts on natural keys (entity_id, IATA code, (source_page, page_index)).
 * Run after migration 016 has been applied.
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import { config as loadEnv } from "dotenv";

// Load .env.local (Next.js convention) and .env. First call wins for any
// given key, so .env.local takes precedence.
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const REPO = arg("repo-path") ?? process.env.EPSTEIN_NETWORK_DATA_PATH;
const ONLY = (arg("only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const DRY_RUN = flag("dry-run");

if (!REPO) {
  console.error(
    "Missing --repo-path (or EPSTEIN_NETWORK_DATA_PATH). Point at a clone of dleerdefi/epstein-network-data."
  );
  process.exit(1);
}

const FINAL = path.join(REPO, "data/final");

function shouldRun(step: string) {
  return ONLY.length === 0 || ONLY.includes(step);
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function readCsv(file: string): Record<string, string>[] {
  const buf = fs.readFileSync(file);
  return parseCsv(buf, { columns: true, skip_empty_lines: true, trim: true });
}

const splitArr = (s: string | undefined): string[] =>
  (s ?? "").trim() === "" ? [] : s!.split(";").map((x) => x.trim()).filter(Boolean);

const intOrNull = (s: string | undefined): number | null => {
  if (!s || s.trim() === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

const floatOrNull = (s: string | undefined): number | null => {
  if (!s || s.trim() === "") return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
};

const boolOrNull = (s: string | undefined): boolean | null => {
  if (!s || s.trim() === "") return null;
  const v = s.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
};

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

// Defer service-client creation until we know we need it — lets --dry-run work
// without SUPABASE env vars set.
let _sb: ReturnType<typeof import("@vismay/content-source/supabase").createServiceClient> | null = null;
async function sb() {
  if (!_sb) {
    const { createServiceClient } = await import("@vismay/content-source/supabase");
    _sb = createServiceClient();
  }
  return _sb;
}

async function upsert(table: string, rows: any[], conflictCol: string) {
  if (rows.length === 0) return;
  if (DRY_RUN) {
    console.log(`  [dry-run] would upsert ${rows.length} into ${table} (onConflict=${conflictCol})`);
    if (rows.length > 0) {
      const first = rows[0];
      const preview = JSON.stringify(first, null, 0);
      console.log(`    sample row: ${preview.length > 400 ? preview.slice(0, 400) + "…" : preview}`);
    }
    return;
  }
  const client = await sb();
  // Supabase has a default payload limit; chunk to be safe.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await client.from(table).upsert(slice, { onConflict: conflictCol });
    if (error) {
      console.error(`upsert ${table} failed (rows ${i}-${i + slice.length}):`, error.message);
      throw error;
    }
  }
  console.log(`  upserted ${rows.length} into ${table}`);
}

async function importPersons() {
  console.log("persons…");
  const rows = readCsv(path.join(FINAL, "epstein_notes/nodes/persons.csv")).map((r) => ({
    entity_id: r["entity_id:ID"],
    name: r.name,
    aliases: splitArr(r["aliases:string[]"]),
    birth_year: intOrNull(r["birth_year:int"]),
    death_year: intOrNull(r["death_year:int"]),
    nationality: r.nationality || null,
    occupations: splitArr(r["occupations:string[]"]),
    summary: r.summary || null,
    sources: splitArr(r["sources:string[]"]),
  }));
  await upsert("epstein_persons", rows, "entity_id");
}

async function importOrganizations() {
  console.log("organizations…");
  const rows = readCsv(path.join(FINAL, "epstein_notes/nodes/organizations.csv")).map((r) => ({
    entity_id: r["entity_id:ID"],
    name: r.name,
    founded: intOrNull(r["founded:int"]),
    location: r.location || null,
    note: r.note || null,
    sources: splitArr(r["sources:string[]"]),
  }));
  await upsert("epstein_organizations", rows, "entity_id");
}

async function importCitations() {
  console.log("citations…");
  const rows = readCsv(path.join(FINAL, "epstein_notes/nodes/citations.csv")).map((r) => ({
    citation_id: r["citation_id:ID"],
    citation_number: intOrNull(r.citation_number),
    title: r.title || null,
    url: r.url || null,
    source_type: r.source_type || null,
    reliability_score: floatOrNull(r["reliability_score:float"]),
    times_referenced: intOrNull(r["times_referenced:int"]) ?? 0,
  }));
  await upsert("epstein_citations", rows, "citation_id");
}

async function importClaims() {
  console.log("claims…");
  const rows = readCsv(path.join(FINAL, "epstein_notes/nodes/claims.csv")).map((r) => ({
    claim_id: r["claim_id:ID"],
    claim_number: r.claim_number || null,
    text: r.text,
    verification_status: r.verification_status || null,
    section: r.section || null,
    subsection: r.subsection || null,
    confidence: floatOrNull(r["confidence:float"]),
    analysis: r.analysis || null,
    citations: splitArr(r["citations:string[]"]),
    entities: splitArr(r["entities:string[]"]),
  }));
  await upsert("epstein_claims", rows, "claim_id");
}

async function importRelationships() {
  console.log("relationships…");
  const dir = path.join(FINAL, "epstein_notes/relationships");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".csv"));
  const all: any[] = [];
  for (const f of files) {
    const rows = readCsv(path.join(dir, f));
    for (const r of rows) {
      all.push({
        rel_type: r[":TYPE"] ?? f.replace(/\.csv$/, ""),
        start_id: r[":START_ID"],
        end_id: r[":END_ID"],
        context: r.context || null,
        confidence: floatOrNull(r["confidence:float"]),
        citations: splitArr(r["citations:string[]"]),
        verification_status: r.verification_status || null,
        circled: boolOrNull(r["circled:boolean"]),
        section: r.section || null,
      });
    }
  }
  // Composite uniqueness — upsert on the named unique constraint.
  await upsert("epstein_relationships", all, "rel_type,start_id,end_id");
}

async function importAirports() {
  console.log("airports…");
  const raw = JSON.parse(
    fs.readFileSync(path.join(FINAL, "geocoded/airport_locations_complete.json"), "utf8")
  );
  const rows = Object.values(raw.airports as Record<string, any>).map((a) => ({
    iata: a.airport_code,
    icao: a.icao_code || null,
    full_name: a.full_name || null,
    lat: a.location?.latitude,
    lng: a.location?.longitude,
    city: a.city || null,
    state: a.state || null,
    country: a.country || null,
    elevation_ft: typeof a.elevation_ft === "number" ? a.elevation_ft : null,
    airport_type: a.airport_type || null,
    data_source: a.data_source || null,
    geocoded_at: a.geocoded_at || null,
  })).filter((r) => r.iata && typeof r.lat === "number" && typeof r.lng === "number");
  await upsert("epstein_airports", rows, "iata");
}

// Parse "1991-04-25" → '1991-04-25', drop "07/1" garbage that's just a partial.
function parseFlightDate(parsed: string | undefined): string | null {
  if (!parsed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
  return null;
}

async function importFlightsAndPassengers() {
  console.log("flights + passengers…");
  const flightsDir = path.join(FINAL, "flight_logs");
  // Note: data/final/flight_logs_pdf/ holds pages 39–118 from the external PDF
  // source. Their JSON shape may differ — verify before adding to this glob.
  const pageFiles = fs
    .readdirSync(flightsDir)
    .filter((f) => /^page_\d+_analysis\.json$/.test(f))
    .sort();

  const flightRows: any[] = [];
  type PendingPassenger = {
    source_page: number;
    page_index: number;
    raw_name: string;
    passenger_code: string | null;
    passenger_type: string | null;
    notable: boolean | null;
    confidence: string | null;
  };
  const pendingPassengers: PendingPassenger[] = [];

  for (const f of pageFiles) {
    const page = JSON.parse(fs.readFileSync(path.join(flightsDir, f), "utf8"));
    const sourcePage: number = page.page_number;
    const flights: any[] = page.flights ?? [];
    flights.forEach((fl, idx) => {
      flightRows.push({
        source_page: sourcePage,
        page_index: idx,
        flight_date: parseFlightDate(fl.date?.parsed),
        flight_date_raw: fl.date?.display ?? fl.date?.original ?? null,
        aircraft_make_model: fl.aircraft?.make_model ?? null,
        aircraft_tail: fl.aircraft?.tail_number ?? null,
        from_codes: fl.route?.from_codes ?? [],
        to_codes: fl.route?.to_codes ?? [],
        miles_flown: intOrNull(fl.flight_data?.miles_flown),
        flight_number: fl.flight_data?.flight_number ?? null,
        remarks: fl.remarks ?? null,
        landings: intOrNull(fl.landings?.count),
        raw: fl,
      });
      for (const p of fl.passengers ?? []) {
        const name = (p.name ?? "").trim();
        if (!name) continue;
        pendingPassengers.push({
          source_page: sourcePage,
          page_index: idx,
          raw_name: name,
          passenger_code: p.code || null,
          passenger_type: p.type || null,
          notable: typeof p.notable === "boolean" ? p.notable : null,
          confidence: p.confidence || null,
        });
      }
    });
  }
  await upsert("epstein_flights", flightRows, "source_page,page_index");

  // Look up flight ids for the (source_page, page_index) pairs we inserted, then
  // wire passengers. Done in two steps because supabase-js doesn't return a
  // post-upsert id map for composite-unique upserts. In dry-run we fabricate
  // synthetic ids so the matching logic still gets exercised.
  const idMap = new Map<string, number>();
  if (DRY_RUN) {
    flightRows.forEach((r, i) => idMap.set(`${r.source_page}:${r.page_index}`, i + 1));
  } else {
    const client = await sb();
    const { data: idRows, error: idErr } = await client
      .from("epstein_flights")
      .select("id, source_page, page_index");
    if (idErr) throw idErr;
    for (const r of idRows ?? []) {
      idMap.set(`${r.source_page}:${r.page_index}`, r.id as number);
    }
  }

  // Best-effort passenger → person match via case-insensitive substring on
  // persons.name. Cheap and good enough for a v1; tighten later if needed.
  let persons: { entity_id: string; name: string }[] = [];
  if (DRY_RUN) {
    // Re-read persons.csv directly so the dry-run path doesn't need Supabase.
    const r = readCsv(path.join(FINAL, "epstein_notes/nodes/persons.csv"));
    persons = r.map((x) => ({ entity_id: x["entity_id:ID"], name: x.name }));
  } else {
    const client = await sb();
    const { data } = await client.from("epstein_persons").select("entity_id, name");
    persons = (data ?? []) as { entity_id: string; name: string }[];
  }
  const personIndex = persons.map((p) => ({
    entity_id: p.entity_id,
    needle: (p.name ?? "").toLowerCase(),
  }));
  function matchPerson(raw: string): string | null {
    const hay = raw.toLowerCase().replace(/^mr\.|^mrs\.|^ms\.|^dr\./i, "").trim();
    if (!hay) return null;
    for (const p of personIndex) {
      if (!p.needle) continue;
      // Match on surname (last token) — coarse but works for "Mr. Maxwell" etc.
      const lastToken = p.needle.split(/\s+/).pop()!;
      if (lastToken.length >= 4 && hay.includes(lastToken)) return p.entity_id;
    }
    return null;
  }

  const passengerRows = pendingPassengers
    .map((p) => {
      const flight_id = idMap.get(`${p.source_page}:${p.page_index}`);
      if (!flight_id) return null;
      return {
        flight_id,
        raw_name: p.raw_name,
        person_entity_id: matchPerson(p.raw_name),
        passenger_code: p.passenger_code,
        passenger_type: p.passenger_type,
        notable: p.notable,
        confidence: p.confidence,
      };
    })
    .filter(Boolean) as any[];

  // No natural key on passengers — replace-by-flight is the cleanest idempotent
  // strategy. Delete then insert.
  if (passengerRows.length > 0) {
    if (DRY_RUN) {
      const matched = passengerRows.filter((p) => p.person_entity_id).length;
      console.log(
        `  [dry-run] would replace ${passengerRows.length} epstein_flight_passengers rows ` +
        `(${matched} matched to a person, ${passengerRows.length - matched} unmatched)`
      );
    } else {
      const client = await sb();
      const flightIds = Array.from(new Set(passengerRows.map((r) => r.flight_id)));
      const { error: delErr } = await client
        .from("epstein_flight_passengers")
        .delete()
        .in("flight_id", flightIds);
      if (delErr) throw delErr;
      const CHUNK = 500;
      for (let i = 0; i < passengerRows.length; i += CHUNK) {
        const { error } = await client
          .from("epstein_flight_passengers")
          .insert(passengerRows.slice(i, i + CHUNK));
        if (error) throw error;
      }
      console.log(`  inserted ${passengerRows.length} into epstein_flight_passengers`);
    }
  }
}

async function importBlackbook() {
  console.log("blackbook…");
  const bbDir = path.join(FINAL, "black_book");
  const csvFile = fs
    .readdirSync(bbDir)
    .filter((f) => f.startsWith("blackbook_") && f.endsWith(".csv"))
    .sort()
    .pop();
  if (!csvFile) {
    console.warn("  no blackbook_*.csv found, skipping");
    return;
  }
  const rows = readCsv(path.join(bbDir, csvFile));

  // Load geocoded address + phone caches and key them by best identifier
  // available. The upstream JSON shapes need a quick verification — these
  // accessor functions are deliberately defensive.
  const geoDir = path.join(FINAL, "geocoded");
  const addrFile = fs
    .readdirSync(geoDir)
    .find((f) => f.startsWith("addresses_neo4j_") && f.endsWith(".json"));
  const phoneFile = "phone_locations_cache.json";

  type GeoHit = { lat: number; lng: number };
  const addrIndex = new Map<string, GeoHit>();
  const phoneIndex = new Map<string, GeoHit>();

  // Normalize an address fragment for fuzzy lookup: lowercase, strip non-alnum,
  // collapse whitespace. Coarse but tolerant of capitalization/punctuation drift.
  const normAddr = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const normPhone = (s: string) => s.replace(/\D/g, "");

  if (addrFile) {
    // Shape: { metadata, entries: { <hash>: { input: {...}, output: { latitude, longitude, … } } } }
    const raw = JSON.parse(fs.readFileSync(path.join(geoDir, addrFile), "utf8"));
    const entries = raw.entries ?? {};
    for (const v of Object.values<any>(entries)) {
      const lat = v?.output?.latitude;
      const lng = v?.output?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      const hit: GeoHit = { lat, lng };
      const inp = v.input ?? {};
      // Index under several candidate keys; whichever matches a blackbook row wins.
      const candidates = [inp.full_address, inp.geocoding_string, inp.street_line1].filter(Boolean);
      for (const c of candidates) addrIndex.set(normAddr(String(c)), hit);
    }
  }
  if (fs.existsSync(path.join(geoDir, phoneFile))) {
    // Shape: { metadata, phones: [{ phone_number, latitude, longitude, … }, …] }
    const raw = JSON.parse(fs.readFileSync(path.join(geoDir, phoneFile), "utf8"));
    const list: any[] = Array.isArray(raw) ? raw : raw.phones ?? [];
    for (const v of list) {
      const lat = v?.latitude;
      const lng = v?.longitude;
      const ph = v?.phone_number;
      if (!ph || typeof lat !== "number" || typeof lng !== "number") continue;
      phoneIndex.set(normPhone(String(ph)), { lat, lng });
    }
  }

  const mapped = rows.map((r) => {
    const addr = (r.Address ?? "").trim();
    const zip = (r.Zip ?? "").trim();
    const city = (r.City ?? "").trim();
    const country = (r.Country ?? "").trim();
    const phones = [r["Phone (no specifics)"], r["Phone (w) – work"], r["Phone (h) – home"], r["Phone (p) – portable/mobile"]]
      .map((p) => (p ?? "").trim())
      .filter(Boolean);

    let lat: number | null = null;
    let lng: number | null = null;
    let src: string | null = null;

    // Try a few address shapes against the geocoded index.
    const addrCandidates = [
      addr,
      [addr, city, zip, country].filter(Boolean).join(", "),
      [addr, city, country].filter(Boolean).join(", "),
    ].filter(Boolean);
    for (const c of addrCandidates) {
      const hit = addrIndex.get(normAddr(c));
      if (hit) { lat = hit.lat; lng = hit.lng; src = "address"; break; }
    }
    if (lat === null) {
      for (const ph of phones) {
        const hit = phoneIndex.get(normPhone(ph));
        if (hit) { lat = hit.lat; lng = hit.lng; src = "phone"; break; }
      }
    }

    return {
      page: intOrNull(r.Page),
      page_link: r["Page-Link"] || null,
      name: r.Name || null,
      surname: r.Surname || null,
      first_name: r["First Name"] || null,
      company: r["Company/Add. Text"] || null,
      address_type: r["Address-Type"] || null,
      address: addr || null,
      zip: r.Zip || null,
      city: r.City || null,
      country: r.Country || null,
      phone_generic: r["Phone (no specifics)"] || null,
      phone_work: r["Phone (w) – work"] || null,
      phone_home: r["Phone (h) – home"] || null,
      phone_mobile: r["Phone (p) – portable/mobile"] || null,
      email: r.Email || null,
      lat, lng, geocoded_source: src,
    };
  });

  if (DRY_RUN) {
    const geocoded = mapped.filter((m) => m.lat !== null).length;
    const byAddr = mapped.filter((m) => m.geocoded_source === "address").length;
    const byPhone = mapped.filter((m) => m.geocoded_source === "phone").length;
    console.log(
      `  [dry-run] would replace ${mapped.length} epstein_blackbook rows ` +
      `(${geocoded} geocoded: ${byAddr} via address, ${byPhone} via phone)`
    );
    if (mapped.length > 0) {
      const preview = JSON.stringify(mapped[0], null, 0);
      console.log(`    sample row: ${preview.length > 400 ? preview.slice(0, 400) + "…" : preview}`);
    }
    return;
  }

  // No natural key — replace whole table on each run. Small enough (~2.3k rows).
  const client = await sb();
  const { error: delErr } = await client
    .from("epstein_blackbook")
    .delete()
    .gte("id", 0);
  if (delErr) throw delErr;
  const CHUNK = 500;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const { error } = await client.from("epstein_blackbook").insert(mapped.slice(i, i + CHUNK));
    if (error) throw error;
  }
  console.log(`  inserted ${mapped.length} into epstein_blackbook`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) console.log("DRY RUN — parsing only, no Supabase writes\n");
  // Persons / orgs / claims / citations must precede relationships
  // (so the FK-less but logical references resolve in queries).
  if (shouldRun("persons"))        await importPersons();
  if (shouldRun("organizations"))  await importOrganizations();
  if (shouldRun("citations"))      await importCitations();
  if (shouldRun("claims"))         await importClaims();
  if (shouldRun("relationships"))  await importRelationships();
  if (shouldRun("airports"))       await importAirports();
  if (shouldRun("flights"))        await importFlightsAndPassengers();
  if (shouldRun("blackbook"))      await importBlackbook();
  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
