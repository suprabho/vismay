/**
 * Epstein document crawler
 *
 * Discovers PDF links from DOJ, FBI Vault, and House Oversight pages,
 * then upserts document records into epstein_documents for the ingest
 * pipeline to download and process.
 *
 * Usage:
 *   npx tsx scripts/epstein/crawl.ts [--source doj|fbi|house] [--limit 100] [--dry-run]
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { JSDOM } from "jsdom";
import { createServiceClient } from "../../lib/supabase";

// ---------------------------------------------------------------------------
// Source definitions
// ---------------------------------------------------------------------------

const SOURCES = {
  doj: {
    name: "doj" as const,
    // Index page lists sub-pages; sub-pages list PDFs
    indexUrls: ["https://www.justice.gov/epstein/doj-disclosures"],
    // sub-page pattern: links on the index that lead to per-dataset pages
    subPagePattern: /justice\.gov\/epstein\/doj-disclosures\/.+/,
    pdfPattern: /\.pdf$/i,
    baseUrl: "https://www.justice.gov",
  },
  fbi: {
    name: "fbi" as const,
    // FBI Vault index lists part pages; each part page links to a PDF
    indexUrls: ["https://vault.fbi.gov/jeffrey-epstein"],
    subPagePattern: /vault\.fbi\.gov\/jeffrey-epstein\/.+/,
    pdfPattern: /\.pdf$/i,
    baseUrl: "https://vault.fbi.gov",
  },
  house: {
    name: "house_oversight" as const,
    // Direct release pages with embedded PDF links
    indexUrls: [
      "https://oversight.house.gov/release/oversight-committee-releases-epstein-records-provided-by-the-department-of-justice/",
    ],
    subPagePattern: null,
    pdfPattern: /\.pdf$/i,
    baseUrl: "https://oversight.house.gov",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; EpsteinVizBot/1.0; research purposes)",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function extractLinks(html: string, baseUrl: string, pattern: RegExp): string[] {
  const dom = new JSDOM(html);
  const anchors = Array.from(dom.window.document.querySelectorAll("a[href]"));
  const urls = new Set<string>();

  for (const a of anchors) {
    const href = (a as HTMLAnchorElement).href;
    if (!href) continue;
    try {
      const resolved = new URL(href, baseUrl).href;
      if (pattern.test(resolved)) urls.add(resolved);
    } catch {
      // skip malformed hrefs
    }
  }

  return [...urls];
}

async function discoverUrls(
  source: (typeof SOURCES)[keyof typeof SOURCES]
): Promise<string[]> {
  const all: string[] = [];

  for (const indexUrl of source.indexUrls) {
    console.log(`  Fetching index: ${indexUrl}`);
    try {
      const indexHtml = await fetchHtml(indexUrl);

      // If source has sub-pages, crawl one level deeper
      if (source.subPagePattern) {
        const subPages = extractLinks(indexHtml, source.baseUrl, source.subPagePattern);
        console.log(`  Found ${subPages.length} sub-pages — crawling each...`);
        for (const subUrl of subPages) {
          try {
            const subHtml = await fetchHtml(subUrl);
            const pdfs = extractLinks(subHtml, source.baseUrl, source.pdfPattern);
            all.push(...pdfs);
            process.stdout.write(`\r    ${all.length} PDFs found so far`);
          } catch (err) {
            console.warn(`\n    Failed sub-page ${subUrl}: ${(err as Error).message}`);
          }
        }
        console.log(`\n  Total: ${all.length} PDF links`);
      } else {
        // Single-level: PDFs directly on the index page
        const links = extractLinks(indexHtml, source.baseUrl, source.pdfPattern);
        console.log(`  Found ${links.length} PDF links`);
        all.push(...links);
      }
    } catch (err) {
      console.warn(`  Failed to fetch ${indexUrl}: ${(err as Error).message}`);
    }
  }

  return [...new Set(all)];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const sourceFilter = args.find((a) => a.startsWith("--source="))?.split("=")[1];
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitArg ? parseInt(limitArg, 10) : Infinity;
  const dryRun = args.includes("--dry-run");

  const supabase = createServiceClient();

  const sourcesToCrawl = sourceFilter
    ? [SOURCES[sourceFilter as keyof typeof SOURCES]].filter(Boolean)
    : Object.values(SOURCES);

  if (!sourcesToCrawl.length) {
    console.error(`Unknown source: ${sourceFilter}. Valid: doj, fbi, house`);
    process.exit(1);
  }

  let totalInserted = 0;
  let totalSkipped = 0;

  for (const source of sourcesToCrawl) {
    console.log(`\nCrawling: ${source.name}`);
    const urls = await discoverUrls(source);
    const limited = urls.slice(0, limit);

    console.log(`  Upserting ${limited.length} documents...`);

    if (dryRun) {
      console.log("  [dry-run] Would upsert:", limited.slice(0, 5), "...");
      continue;
    }

    // Batch upsert in groups of 100 to avoid hitting row limits
    for (let i = 0; i < limited.length; i += 100) {
      const batch = limited.slice(i, i + 100).map((url) => ({
        source: source.name,
        source_url: url,
        filename: url.split("/").pop() ?? null,
        file_type: "pdf" as const,
        status: "pending" as const,
      }));

      const { data, error } = await supabase
        .from("epstein_documents")
        .upsert(batch, { onConflict: "source_url", ignoreDuplicates: true })
        .select("id");

      if (error) {
        console.error(`  DB error: ${error.message}`);
      } else {
        const inserted = data?.length ?? 0;
        totalInserted += inserted;
        totalSkipped += batch.length - inserted;
      }
    }
  }

  console.log(`\nDone. Inserted: ${totalInserted} | Skipped (already exist): ${totalSkipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
