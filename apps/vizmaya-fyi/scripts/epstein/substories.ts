/**
 * Substory graph builder — Phase 4
 *
 * Reads epstein_mentions to build a co-occurrence graph across people,
 * locations, and events that appear in the same document. Runs a simple
 * community detection (greedy modularity via union-find) to cluster
 * entities into substories, then uses Claude to generate a title + summary
 * for each cluster.
 *
 * Usage:
 *   npx tsx scripts/epstein/substories.ts [--min-edge-weight 2]
 *
 * Environment:
 *   ANTHROPIC_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createServiceClient } from "../../lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EntityNode {
  id: string;
  type: "person" | "location" | "event";
  name: string;
}

interface Edge {
  a: string; // entity_id
  b: string; // entity_id
  weight: number;
}

// ---------------------------------------------------------------------------
// Union-Find for community detection
// ---------------------------------------------------------------------------

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string) {
    const px = this.find(x);
    const py = this.find(y);
    if (px === py) return;
    const rx = this.rank.get(px) ?? 0;
    const ry = this.rank.get(py) ?? 0;
    if (rx < ry) this.parent.set(px, py);
    else if (rx > ry) this.parent.set(py, px);
    else {
      this.parent.set(py, px);
      this.rank.set(px, rx + 1);
    }
  }

  communities(): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    for (const [node] of this.parent) {
      const root = this.find(node);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(node);
    }
    return groups;
  }
}

// ---------------------------------------------------------------------------
// Claude substory titling
// ---------------------------------------------------------------------------

async function generateSubstoryTitle(
  people: string[],
  locations: string[],
  events: string[]
): Promise<{ title: string; summary: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const prompt = `Given this cluster of entities from Epstein-related documents, generate a concise substory title and 1-sentence summary.

People: ${people.slice(0, 15).join(", ") || "none"}
Locations: ${locations.slice(0, 10).join(", ") || "none"}
Events: ${events.slice(0, 10).join(", ") || "none"}

Respond ONLY with JSON, no markdown: {"title": "...", "summary": "..."}
Title must be under 60 chars. Summary is 1 sentence describing the connection.`;

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey });
    const res = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });
    const text = res.text ?? "{}";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { title: "Untitled Cluster", summary: "" };
    const parsed = JSON.parse(match[0]);
    return {
      title: parsed.title ?? "Untitled Cluster",
      summary: parsed.summary ?? "",
    };
  } catch {
    return { title: "Untitled Cluster", summary: "" };
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const minEdgeWeight = parseInt(
    args.find((a) => a.startsWith("--min-edge-weight="))?.split("=")[1] ?? "2",
    10
  );

  const supabase = createServiceClient();

  // 1. Fetch all mentions with entity names
  console.log("Fetching mentions...");
  const { data: mentions, error: mErr } = await supabase
    .from("epstein_mentions")
    .select("chunk_id, entity_type, entity_id");

  if (mErr || !mentions?.length) {
    console.error("No mentions found. Run ner.ts first.", mErr?.message);
    process.exit(1);
  }

  console.log(`  ${mentions.length} mention records`);

  // 2. Build entity name maps
  const [{ data: people }, { data: locations }, { data: events }] =
    await Promise.all([
      supabase.from("epstein_people").select("id, name"),
      supabase.from("epstein_locations").select("id, name"),
      supabase.from("epstein_events").select("id, name"),
    ]);

  const nameMap = new Map<string, EntityNode>();
  for (const p of people ?? [])
    nameMap.set(p.id, { id: p.id, type: "person", name: p.name });
  for (const l of locations ?? [])
    nameMap.set(l.id, { id: l.id, type: "location", name: l.name });
  for (const e of events ?? [])
    nameMap.set(e.id, { id: e.id, type: "event", name: e.name });

  // 3. Build co-occurrence edges (entities in same chunk = co-occur)
  const chunkEntities = new Map<string, string[]>();
  for (const m of mentions) {
    if (!chunkEntities.has(m.chunk_id)) chunkEntities.set(m.chunk_id, []);
    chunkEntities.get(m.chunk_id)!.push(m.entity_id);
  }

  const edgeWeights = new Map<string, number>();
  for (const entities of chunkEntities.values()) {
    const unique = [...new Set(entities)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = [unique[i], unique[j]].sort().join("|");
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
      }
    }
  }

  // 4. Filter by min weight and build Union-Find communities
  const uf = new UnionFind();
  let edgeCount = 0;

  for (const [key, weight] of edgeWeights) {
    if (weight < minEdgeWeight) continue;
    const [a, b] = key.split("|");
    uf.union(a, b);
    edgeCount++;
  }

  console.log(`  ${edgeCount} edges (min weight=${minEdgeWeight})`);

  const communities = uf.communities();
  const significantClusters = [...communities.values()].filter(
    (cluster) => cluster.length >= 3
  );

  console.log(
    `  ${significantClusters.length} substory clusters (≥3 entities)`
  );

  // 5. Delete old generated substories (preserve seeds) and insert new ones
  await supabase.from("epstein_substories").delete().eq("is_seed", false);

  let inserted = 0;
  for (const cluster of significantClusters) {
    const nodes = cluster
      .map((id) => nameMap.get(id))
      .filter(Boolean) as EntityNode[];

    const clusterPeople = nodes.filter((n) => n.type === "person").map((n) => n.name);
    const clusterLocations = nodes.filter((n) => n.type === "location").map((n) => n.name);
    const clusterEvents = nodes.filter((n) => n.type === "event").map((n) => n.name);

    // Get doc count: how many unique documents contain these entities
    const entityIds = cluster;
    const { count } = await supabase
      .from("epstein_mentions")
      .select("chunk_id", { count: "exact", head: true })
      .in("entity_id", entityIds);

    const { title, summary } = await generateSubstoryTitle(
      clusterPeople,
      clusterLocations,
      clusterEvents
    );

    await supabase.from("epstein_substories").insert({
      title,
      summary,
      doc_count: count ?? 0,
      people: clusterPeople,
      locations: clusterLocations,
      events: clusterEvents,
    });

    inserted++;
    process.stdout.write(`\r  ${inserted}/${significantClusters.length} substories generated`);
  }

  console.log("\nSubstory generation complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
