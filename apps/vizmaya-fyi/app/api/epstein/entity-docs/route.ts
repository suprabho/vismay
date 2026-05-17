/**
 * GET /api/epstein/entity-docs?entityType=person|location|event&entityId=uuid
 * Returns the source documents that mention a given entity.
 */

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Get chunk IDs that mention this entity
  const { data: mentions, error: mErr } = await supabase
    .from("epstein_mentions")
    .select("chunk_id, context")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .limit(50);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!mentions?.length) return NextResponse.json({ docs: [] });

  const chunkIds = [...new Set(mentions.map((m) => m.chunk_id))];

  // Get documents for those chunks
  const { data: chunks, error: cErr } = await supabase
    .from("epstein_chunks")
    .select("document_id")
    .in("id", chunkIds);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  const docIds = [...new Set(chunks?.map((c) => c.document_id) ?? [])];

  const { data: docs, error: dErr } = await supabase
    .from("epstein_documents")
    .select("id, source, source_url, filename")
    .in("id", docIds)
    .limit(20);

  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });

  // Attach a sample context snippet per doc
  const docContextMap: Record<string, string> = {};
  for (const m of mentions) {
    const chunk = chunks?.find((c) => c.document_id && m.chunk_id === m.chunk_id);
    if (chunk && m.context && !docContextMap[chunk.document_id]) {
      docContextMap[chunk.document_id] = m.context;
    }
  }

  return NextResponse.json({
    docs: (docs ?? []).map((d) => ({
      ...d,
      context: docContextMap[d.id] ?? null,
    })),
  });
}
