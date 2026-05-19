import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import EpsteinMap from "./EpsteinMap";
import { getEpic } from "@vismay/content-source/epics";
import { resolveEpsteinTheme } from "./theme";

const title = "Epstein Flight Network — vizmaya";
const description =
  "An interactive map of Jeffrey Epstein's private flights, the people who flew on them, and the addresses in his black book.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/epstein" },
  openGraph: {
    type: "website",
    title,
    description,
    url: "/epstein",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

// Fetch at request time. Data is tiny (~50 KB serialized) so SSR > client fetch.
export const dynamic = "force-dynamic";

export type Airport = {
  iata: string;
  full_name: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  traffic: number;
};

export type Flight = {
  id: number;
  flight_date: string | null;        // YYYY-MM-DD or null
  year: number | null;
  from_codes: string[];
  to_codes: string[];
  aircraft_tail: string | null;
  remarks: string | null;
  passengers: string[];              // raw_name list
};

export type BlackbookPoint = {
  id: number;
  name: string;
  country: string | null;
  city: string | null;
  lat: number;
  lng: number;
};

export type PersonSummary = {
  entity_id: string;
  name: string;
  nationality: string | null;
  aliases: string[];
  occupations: string[];
  summary: string | null;
  importance: number;          // relationship_count + flight_count, used for sidebar ordering
};

async function loadData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { airports: [], flights: [], blackbook: [], persons: [] };
  }
  const sb = createClient(url, anon);

  const [airportsR, flightsR, passengersR, paxLinksR, relR, blackbookR, personsR] = await Promise.all([
    sb.from("epstein_airports").select("iata, full_name, city, country, lat, lng"),
    sb
      .from("epstein_flights")
      .select("id, flight_date, from_codes, to_codes, aircraft_tail, remarks"),
    sb.from("epstein_flight_passengers").select("flight_id, raw_name"),
    sb
      .from("epstein_flight_passengers")
      .select("person_entity_id")
      .not("person_entity_id", "is", null),
    sb.from("epstein_relationships").select("start_id, end_id"),
    sb
      .from("epstein_blackbook")
      .select("id, name, country, city, lat, lng")
      .not("lat", "is", null),
    sb
      .from("epstein_persons")
      .select("entity_id, name, nationality, aliases, occupations, summary"),
  ]);

  // Group passengers by flight_id
  const paxByFlight = new Map<number, string[]>();
  for (const p of passengersR.data ?? []) {
    const arr = paxByFlight.get(p.flight_id) ?? [];
    arr.push(p.raw_name);
    paxByFlight.set(p.flight_id, arr);
  }

  // Tally airport traffic from flight legs
  const traffic = new Map<string, number>();
  const flights: Flight[] = (flightsR.data ?? []).map((f) => {
    const codes = [...(f.from_codes ?? []), ...(f.to_codes ?? [])];
    for (const c of codes) traffic.set(c, (traffic.get(c) ?? 0) + 1);
    return {
      id: f.id as number,
      flight_date: f.flight_date,
      year: f.flight_date ? Number(f.flight_date.slice(0, 4)) : null,
      from_codes: f.from_codes ?? [],
      to_codes: f.to_codes ?? [],
      aircraft_tail: f.aircraft_tail,
      remarks: f.remarks,
      passengers: paxByFlight.get(f.id as number) ?? [],
    };
  });

  const airports: Airport[] = (airportsR.data ?? []).map((a) => ({
    iata: a.iata,
    full_name: a.full_name,
    city: a.city,
    country: a.country,
    lat: a.lat,
    lng: a.lng,
    traffic: traffic.get(a.iata) ?? 0,
  }));

  const blackbook: BlackbookPoint[] = (blackbookR.data ?? []).map((b) => ({
    id: b.id as number,
    name: b.name ?? "—",
    country: b.country,
    city: b.city,
    lat: b.lat,
    lng: b.lng,
  }));

  // Importance per person = inbound + outbound relationships + linked flights.
  // Excludes pure documentation edges (CLAIM_ABOUT, SUPPORTED_BY) since the
  // schema doesn't distinguish those at the entity level — for v1 we accept the
  // small boost they give Epstein/Maxwell/etc., which is already where you want
  // them at the top of the list.
  const degree = new Map<string, number>();
  const bump = (id: string | null | undefined) => {
    if (!id || !id.startsWith("person_")) return;
    degree.set(id, (degree.get(id) ?? 0) + 1);
  };
  for (const r of relR.data ?? []) {
    bump((r as { start_id?: string }).start_id);
    bump((r as { end_id?: string }).end_id);
  }
  for (const p of paxLinksR.data ?? []) bump((p as { person_entity_id?: string }).person_entity_id);

  const persons: PersonSummary[] = (personsR.data ?? [])
    .map((p) => ({
      entity_id: p.entity_id,
      name: p.name,
      nationality: p.nationality,
      aliases: p.aliases ?? [],
      occupations: p.occupations ?? [],
      summary: p.summary,
      importance: degree.get(p.entity_id) ?? 0,
    }))
    .sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));

  return { airports, flights, blackbook, persons };
}

export default async function EpsteinPage() {
  const [data, epic] = await Promise.all([loadData(), getEpic("epstein")]);
  const theme = resolveEpsteinTheme(epic?.theme);
  return <EpsteinMap {...data} theme={theme} />;
}
