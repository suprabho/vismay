/**
 * Recompute mention_count on epstein_people / epstein_locations / epstein_events
 * from the authoritative epstein_mentions junction table.
 *
 * Safe to run any time; idempotent.
 */
import { createServiceClient } from "../../lib/supabase";

async function rebuildFor(
  table: "epstein_people" | "epstein_locations" | "epstein_events",
  entityType: "person" | "location" | "event"
) {
  const supabase = createServiceClient();
  const { data: rows } = await supabase.from(table).select("id");
  if (!rows) return;

  for (const row of rows as { id: string }[]) {
    const { count } = await supabase
      .from("epstein_mentions")
      .select("*", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .eq("entity_id", row.id);
    await supabase
      .from(table)
      .update({ mention_count: count ?? 0 })
      .eq("id", row.id);
  }
  console.log(`  ${table}: recomputed ${rows.length} rows`);
}

async function main() {
  await rebuildFor("epstein_people", "person");
  await rebuildFor("epstein_locations", "location");
  await rebuildFor("epstein_events", "event");
}
main().catch((e) => { console.error(e); process.exit(1); });
