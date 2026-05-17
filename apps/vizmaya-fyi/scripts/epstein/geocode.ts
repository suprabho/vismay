/**
 * Geocoding + entity resolution for Epstein locations
 *
 * Fetches ungeocoded locations from epstein_locations, resolves them via
 * Nominatim (OSM, free), and stores lat/lng back into the table.
 * Also deduplicates canonical names (e.g. "NYC" → "New York City").
 *
 * Usage:
 *   npx tsx scripts/epstein/geocode.ts [--limit 500] [--delay 1100]
 *
 * Nominatim ToS requires:
 *   - Max 1 request/second (default delay 1100ms)
 *   - User-Agent identifying the application
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createServiceClient } from "../../lib/supabase";

// ---------------------------------------------------------------------------
// Nominatim geocoding
// ---------------------------------------------------------------------------

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "EpsteinVizBot/1.0 (research; hello@promad.design)";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
}

async function geocode(
  name: string
): Promise<{ lat: number; lng: number; canonical: string } | null> {
  const params = new URLSearchParams({
    q: name,
    format: "json",
    limit: "1",
    addressdetails: "0",
  });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const results: NominatimResult[] = await res.json();
    if (!results.length) return null;

    const top = results[0];
    return {
      lat: parseFloat(top.lat),
      lng: parseFloat(top.lon),
      canonical: top.display_name.split(",")[0].trim(),
    };
  } catch (err) {
    console.warn(`    Geocode failed for "${name}": ${(err as Error).message}`);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Deduplication aliases
// ---------------------------------------------------------------------------

// Common aliases → canonical name. Expand as needed.
const ALIASES: Record<string, string> = {
  "NYC": "New York City",
  "New York": "New York City",
  "NY": "New York City",
  "DC": "Washington, D.C.",
  "Washington DC": "Washington, D.C.",
  "D.C.": "Washington, D.C.",
  "US": "United States",
  "USA": "United States",
  "U.S.": "United States",
  "U.S.A.": "United States",
  "UK": "United Kingdom",
  "Great Britain": "United Kingdom",
  "UAE": "United Arab Emirates",
  "Palm Beach": "Palm Beach, Florida",
  "Manhattan": "Manhattan, New York City",
  "Little St. James": "Little Saint James Island",
  "Little St James": "Little Saint James Island",
  // US Federal Judicial Districts → representative city
  "Southern District of Florida": "Miami, Florida",
  "Northern District of Florida": "Tallahassee, Florida",
  "Middle District of Florida": "Tampa, Florida",
  "Southern District of New York": "Manhattan, New York City",
  "Northern District of New York": "Albany, New York",
  "Eastern District of New York": "Brooklyn, New York",
  "Southern District of Texas": "Houston, Texas",
  "District of Columbia": "Washington, D.C.",
};

function resolveAlias(name: string): string {
  return ALIASES[name] ?? name;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(
    args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "500",
    10
  );
  const delay = parseInt(
    args.find((a) => a.startsWith("--delay="))?.split("=")[1] ?? "1100",
    10
  );

  const supabase = createServiceClient();

  const { data: locations, error } = await supabase
    .from("epstein_locations")
    .select("id, name")
    .eq("geocoded", false)
    .limit(limit);

  if (error) {
    console.error("Failed to fetch locations:", error.message);
    process.exit(1);
  }

  if (!locations?.length) {
    console.log("No ungeocoded locations. Run ner.ts first.");
    return;
  }

  console.log(`Geocoding ${locations.length} locations (${delay}ms delay)...`);

  let success = 0;
  let failed = 0;

  for (const loc of locations) {
    const resolved = resolveAlias(loc.name);
    const result = await geocode(resolved);

    if (result) {
      await supabase
        .from("epstein_locations")
        .update({
          lat: result.lat,
          lng: result.lng,
          canonical_name: result.canonical,
          geocoded: true,
        })
        .eq("id", loc.id);
      success++;
      process.stdout.write(`\r  ${success} geocoded, ${failed} failed`);
    } else {
      await supabase
        .from("epstein_locations")
        .update({ geocoded: true })  // mark done even if no result, avoid retrying indefinitely
        .eq("id", loc.id);
      failed++;
    }

    await sleep(delay);  // Nominatim rate limit: 1 req/sec
  }

  console.log(`\nGeocoding complete. Success: ${success} | Failed (no result): ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
