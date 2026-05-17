/**
 * GET /api/epstein/substories
 * Returns substory clusters ordered by doc_count desc.
 */

import { NextResponse } from "next/server";
import { createBrowserClient } from "@/lib/supabase";

export async function GET() {
  const supabase = createBrowserClient();

  const WITH_NARRATIVE =
    "id, title, summary, narrative, doc_count, people, locations, events";
  const LEGACY = "id, title, summary, doc_count, people, locations, events";

  // `narrative` was added in migration 003. Fall back to the legacy shape if
  // the column isn't there yet so the page stays usable before migration runs.
  const first = await supabase
    .from("epstein_substories")
    .select(WITH_NARRATIVE)
    .order("doc_count", { ascending: false })
    .limit(200);

  let data: unknown = first.data;
  let error = first.error;

  if (error && /narrative/.test(error.message)) {
    const fallback = await supabase
      .from("epstein_substories")
      .select(LEGACY)
      .order("doc_count", { ascending: false })
      .limit(200);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
