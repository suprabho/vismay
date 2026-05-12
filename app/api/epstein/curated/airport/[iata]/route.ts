import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env vars");
  return createClient(url, anon);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ iata: string }> }
) {
  const { iata: iataParam } = await params;
  const iata = iataParam.toUpperCase();
  const sb = client();

  // Airport row + flights touching this IATA (in either from_codes or to_codes).
  const [airportR, flightsR] = await Promise.all([
    sb
      .from("epstein_airports")
      .select("iata, full_name, city, country, state, lat, lng, airport_type")
      .eq("iata", iata)
      .maybeSingle(),
    sb
      .from("epstein_flights")
      .select("id, flight_date, from_codes, to_codes, aircraft_tail, remarks")
      .or(`from_codes.cs.{${iata}},to_codes.cs.{${iata}}`)
      .order("flight_date", { ascending: true }),
  ]);

  type Flight = {
    id: number;
    flight_date: string | null;
    from_codes: string[] | null;
    to_codes: string[] | null;
    aircraft_tail: string | null;
    remarks: string | null;
  };
  const flightRows = (flightsR.data ?? []) as Flight[];
  const flightIds = flightRows.map((f) => f.id);

  // Passengers on those flights
  const passengersR = flightIds.length
    ? await sb
        .from("epstein_flight_passengers")
        .select("flight_id, raw_name, person_entity_id")
        .in("flight_id", flightIds)
    : { data: [] as { flight_id: number; raw_name: string; person_entity_id: string | null }[] };

  type Pax = { flight_id: number; raw_name: string; person_entity_id: string | null };
  const paxRows = (passengersR.data ?? []) as Pax[];

  // Resolve person names for any person_entity_id we have
  const personIds = Array.from(
    new Set(paxRows.map((p) => p.person_entity_id).filter((x): x is string => Boolean(x)))
  );
  const personsR = personIds.length
    ? await sb.from("epstein_persons").select("entity_id, name").in("entity_id", personIds)
    : { data: [] as { entity_id: string; name: string }[] };
  const personById = new Map<string, string>();
  for (const p of personsR.data ?? []) personById.set(p.entity_id, p.name);

  // Group passengers by flight
  const paxByFlight = new Map<number, { raw_name: string; person_entity_id: string | null }[]>();
  for (const p of paxRows) {
    const arr = paxByFlight.get(p.flight_id) ?? [];
    arr.push({ raw_name: p.raw_name, person_entity_id: p.person_entity_id });
    paxByFlight.set(p.flight_id, arr);
  }

  // Aggregate persons across all flights at this airport, ranked by flight count
  const personCounts = new Map<string, { entity_id: string; name: string; flights: number }>();
  for (const p of paxRows) {
    if (!p.person_entity_id) continue;
    const name = personById.get(p.person_entity_id);
    if (!name) continue;
    const cur = personCounts.get(p.person_entity_id);
    if (cur) cur.flights += 1;
    else
      personCounts.set(p.person_entity_id, {
        entity_id: p.person_entity_id,
        name,
        flights: 1,
      });
  }
  const persons = Array.from(personCounts.values()).sort(
    (a, b) => b.flights - a.flights || a.name.localeCompare(b.name)
  );

  const flights = flightRows.map((f) => ({
    flight_id: f.id,
    flight_date: f.flight_date,
    from_codes: f.from_codes ?? [],
    to_codes: f.to_codes ?? [],
    aircraft_tail: f.aircraft_tail,
    remarks: f.remarks,
    passengers: paxByFlight.get(f.id) ?? [],
  }));

  return NextResponse.json({
    airport: airportR.data ?? null,
    flights,
    persons,
  });
}
