/**
 * GET /api/epstein/entities
 * Returns geocoded locations, people (with associated_location), and events
 * for the map visualization.
 *
 * Query params:
 *   type = location | person | event | all (default: all)
 *   limit = number (default 1000)
 */

import { NextResponse } from "next/server";
import { createBrowserClient } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "all";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "1000"), 5000);

  const supabase = createBrowserClient();

  const results: Record<string, unknown[]> = {};

  if (type === "all" || type === "location") {
    const { data } = await supabase
      .from("epstein_locations")
      .select("id, name, canonical_name, lat, lng, mention_count")
      .eq("geocoded", true)
      .not("lat", "is", null)
      .order("mention_count", { ascending: false })
      .limit(limit);
    results.locations = data ?? [];
  }

  if (type === "all" || type === "person") {
    const { data } = await supabase
      .from("epstein_people")
      .select("id, name, role, associated_location, mention_count")
      .order("mention_count", { ascending: false })
      .limit(limit);
    results.people = data ?? [];
  }

  if (type === "all" || type === "event") {
    const { data } = await supabase
      .from("epstein_events")
      .select("id, name, event_date, location_name, mention_count")
      .order("mention_count", { ascending: false })
      .limit(limit);
    results.events = data ?? [];
  }

  return NextResponse.json(results);
}
