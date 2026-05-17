/**
 * Seed the "DOJ Releases Epstein Files Under Bondi" substory.
 *
 * Idempotent: matches on title and updates narrative + flags in place.
 * Run after migration 003 has been applied.
 *
 *   pnpm epstein:seed-bondi
 */

import { createServiceClient } from "../../lib/supabase";

const TITLE = "DOJ Releases Epstein Files Under Bondi (2025)";

const SUMMARY =
  "From the February 2025 binder rollout to the Transparency Act — how one cache of documents moved through the disclosure machinery.";

const NARRATIVE = `In February 2025, Attorney General Pam Bondi announced the release of a "Phase 1" binder of declassified Epstein-related documents. The binder was handed to a group of conservative influencers on the White House driveway before being posted publicly, and was billed as a major disclosure. Within hours it was clear the contents were overwhelmingly material already in the public record through prior court filings, FOIA productions, and earlier congressional releases — a packaging exercise rather than a new disclosure.

The rollout set off months of pressure on the DOJ and FBI to release more substantive records. Inside the building, FBI leadership pushed back on the framing; outside it, families of victims, journalists, and a cross-ideological group of lawmakers began asking for the underlying files rather than curated excerpts. In July 2025, the DOJ and FBI issued a joint memo stating that their review had found no evidence of a "client list," no credible basis to charge uncharged third parties, and that no further public release of the Epstein files was warranted. The memo also reaffirmed the 2019 medical examiner finding of suicide in Epstein's Manhattan jail cell.

The July memo widened the fight rather than closing it. A bipartisan coalition in the House — led by Rep. Thomas Massie and Rep. Ro Khanna — moved to force a floor vote on the Epstein Files Transparency Act, which would require the DOJ to release its unclassified Epstein-related holdings subject to narrow victim-protection redactions and fixed deadlines. After a discharge petition cleared the House in November 2025, the bill passed both chambers and was signed into law the same month, putting a statutory clock on the department.

This substory collects the documents and disclosures that arose from that sequence: the February binder itself, internal DOJ correspondence and memos released through subsequent productions, the July joint memo, congressional letters and hearing transcripts, and the first tranches produced under the Transparency Act. Taken together, the trail is a case study in how a single cache of records moves through the disclosure machinery — where, at each step, the record grows, narrows, or is withheld, and who decides which.`;

const PEOPLE = [
  "Jeffrey Epstein",
  "Pam Bondi",
  "Thomas Massie",
  "Ro Khanna",
  "Kash Patel",
  "Dan Bongino",
];

const LOCATIONS = ["Washington, DC", "New York, NY"];

const EVENTS = [
  "Phase 1 Binder Release (Feb 2025)",
  "DOJ/FBI Joint Memo (Jul 2025)",
  "Epstein Files Transparency Act (Nov 2025)",
];

async function main() {
  const supabase = createServiceClient();

  const { data: existing, error: findErr } = await supabase
    .from("epstein_substories")
    .select("id")
    .eq("title", TITLE)
    .maybeSingle();

  if (findErr) {
    console.error("Lookup failed:", findErr.message);
    process.exit(1);
  }

  const payload = {
    title: TITLE,
    summary: SUMMARY,
    narrative: NARRATIVE,
    is_seed: true,
    doc_count: 0,
    people: PEOPLE,
    locations: LOCATIONS,
    events: EVENTS,
  };

  if (existing) {
    const { error } = await supabase
      .from("epstein_substories")
      .update(payload)
      .eq("id", existing.id);
    if (error) {
      console.error("Update failed:", error.message);
      process.exit(1);
    }
    console.log(`Updated seed substory ${existing.id}`);
  } else {
    const { data, error } = await supabase
      .from("epstein_substories")
      .insert(payload)
      .select("id")
      .single();
    if (error) {
      console.error("Insert failed:", error.message);
      process.exit(1);
    }
    console.log(`Inserted seed substory ${data.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
