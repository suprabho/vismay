import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env vars");
  return createClient(url, anon);
}

function kindOf(entityId: string): "person" | "organization" | "claim" | "citation" | "other" {
  if (entityId.startsWith("person_")) return "person";
  if (entityId.startsWith("org_")) return "organization";
  if (entityId.startsWith("claim_")) return "claim";
  if (entityId.startsWith("cite_")) return "citation";
  return "other";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = client();

  const [outR, inR, person] = await Promise.all([
    sb
      .from("epstein_relationships")
      .select("rel_type, start_id, end_id, context, confidence, citations, verification_status")
      .eq("start_id", id),
    sb
      .from("epstein_relationships")
      .select("rel_type, start_id, end_id, context, confidence, citations, verification_status")
      .eq("end_id", id),
    sb.from("epstein_persons").select("entity_id, name").eq("entity_id", id).maybeSingle(),
  ]);

  type Row = {
    rel_type: string;
    start_id: string;
    end_id: string;
    context: string | null;
    confidence: number | null;
    citations: string[] | null;
    verification_status: string | null;
  };

  const allEdges: Array<Row & { direction: "out" | "in" }> = [
    ...((outR.data ?? []) as Row[]).map((r) => ({ ...r, direction: "out" as const })),
    ...((inR.data ?? []) as Row[]).map((r) => ({ ...r, direction: "in" as const })),
  ];

  // Resolve the "other side" names
  const otherIds = Array.from(new Set(allEdges.map((e) => (e.direction === "out" ? e.end_id : e.start_id))));
  const personIds = otherIds.filter((x) => kindOf(x) === "person");
  const orgIds = otherIds.filter((x) => kindOf(x) === "organization");

  const [otherPersons, otherOrgs] = await Promise.all([
    personIds.length
      ? sb.from("epstein_persons").select("entity_id, name").in("entity_id", personIds)
      : Promise.resolve({ data: [] as { entity_id: string; name: string }[] }),
    orgIds.length
      ? sb.from("epstein_organizations").select("entity_id, name").in("entity_id", orgIds)
      : Promise.resolve({ data: [] as { entity_id: string; name: string }[] }),
  ]);

  const nameByEntityId = new Map<string, string>();
  for (const p of otherPersons.data ?? []) nameByEntityId.set(p.entity_id, p.name);
  for (const o of otherOrgs.data ?? []) nameByEntityId.set(o.entity_id, o.name);

  const relationships = allEdges.map((e) => {
    const other_id = e.direction === "out" ? e.end_id : e.start_id;
    const kind = kindOf(other_id);
    return {
      rel_type: e.rel_type,
      other_id,
      other_name: nameByEntityId.get(other_id) ?? null,
      other_kind: kind === "person" || kind === "organization" ? kind : ("other" as const),
      direction: e.direction,
      context: e.context,
      confidence: e.confidence,
      citations: e.citations ?? [],
      verification_status: e.verification_status,
    };
  });

  // Resolve citations referenced by these edges
  const citationNumbers = Array.from(
    new Set(relationships.flatMap((r) => r.citations))
  ).filter(Boolean);
  const citationsR = citationNumbers.length
    ? await sb
        .from("epstein_citations")
        .select("citation_id, citation_number, title, url, source_type")
        .in("citation_number", citationNumbers.map((n) => Number(n)).filter((n) => Number.isFinite(n)))
    : { data: [] as any[] };

  // Flights — match person on the (already-loader-resolved) person_entity_id link,
  // OR fall back to a surname substring against raw_name. Both paths included so we
  // catch flights the loader missed.
  const personName: string | undefined = person.data?.name;
  const surname = personName?.split(/\s+/).pop()?.toLowerCase() ?? "";

  const [paxByLink, paxByName] = await Promise.all([
    sb
      .from("epstein_flight_passengers")
      .select("flight_id, raw_name")
      .eq("person_entity_id", id),
    surname.length >= 4
      ? sb
          .from("epstein_flight_passengers")
          .select("flight_id, raw_name")
          .ilike("raw_name", `%${surname}%`)
      : Promise.resolve({ data: [] as { flight_id: number; raw_name: string }[] }),
  ]);
  const seen = new Set<number>();
  const passengerHits: { flight_id: number; raw_name: string }[] = [];
  for (const hit of [...(paxByLink.data ?? []), ...(paxByName.data ?? [])]) {
    if (!seen.has(hit.flight_id)) {
      seen.add(hit.flight_id);
      passengerHits.push(hit);
    }
  }

  let flights: any[] = [];
  if (passengerHits.length > 0) {
    const flightIds = passengerHits.map((p) => p.flight_id);
    const flightsR = await sb
      .from("epstein_flights")
      .select("id, flight_date, from_codes, to_codes, aircraft_tail")
      .in("id", flightIds)
      .order("flight_date", { ascending: true });
    const rawNameByFlightId = new Map<number, string>();
    for (const p of passengerHits) rawNameByFlightId.set(p.flight_id, p.raw_name);
    flights = (flightsR.data ?? []).map((f) => ({
      flight_id: f.id,
      flight_date: f.flight_date,
      from_codes: f.from_codes ?? [],
      to_codes: f.to_codes ?? [],
      aircraft_tail: f.aircraft_tail,
      raw_name: rawNameByFlightId.get(f.id as number) ?? "",
    }));
  }

  // Black book entry — surname match against the blackbook's structured surname
  // column rather than a substring on the raw name field. Avoids over-matching
  // common tokens like "Hall" / "Cohen" / "King".
  let blackbook: any[] = [];
  if (personName && surname.length >= 4) {
    const bbR = await sb
      .from("epstein_blackbook")
      .select("id, name, address, city, country, email, surname, first_name")
      .ilike("surname", surname)
      .limit(8);
    blackbook = (bbR.data ?? []).map((b) => ({
      id: b.id,
      name: b.name,
      address: b.address,
      city: b.city,
      country: b.country,
      email: b.email,
    }));
  }

  return NextResponse.json({
    relationships,
    citations: citationsR.data ?? [],
    flights,
    blackbook,
  });
}
