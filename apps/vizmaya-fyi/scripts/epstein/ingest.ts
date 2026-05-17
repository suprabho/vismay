/**
 * Epstein document ingest: download → extract text → chunk → store
 *
 * Picks up documents with status='pending' from epstein_documents,
 * downloads each PDF, extracts text, splits into ~2000-token chunks,
 * and stores them in epstein_chunks.
 *
 * Usage:
 *   npx tsx scripts/epstein/ingest.ts [--limit 10] [--concurrency 3]
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createHash } from "crypto";
import { createServiceClient } from "../../lib/supabase";

// Rough token estimate: 1 token ≈ 4 chars
const TARGET_TOKENS = 2000;
const CHARS_PER_CHUNK = TARGET_TOKENS * 4;
const CHUNK_OVERLAP_CHARS = 200;

// Below this, assume pdf-parse failed (scanned PDF) and try Gemini OCR.
const EMPTY_TEXT_THRESHOLD = 500;

// DOJ bates-stamp-only scans look like "EFTA00000036\n-- 1 of 1 --" (~30 chars).
// Anything above this from OCR has real labels/content worth keeping.
const OCR_KEEP_THRESHOLD = 40;

// Gemini inline-data cap is ~20MB; above this we'd need the File API.
const GEMINI_INLINE_MAX_BYTES = 18 * 1024 * 1024;

// Minimum spacing between Gemini OCR requests. Free-tier limits are stingy
// (~5 RPM in practice for gemini-2.0-flash with PDF inline data), so pace
// conservatively to avoid tripping 429s.
const OCR_MIN_INTERVAL_MS = 12_000;
let lastOcrCallAt = 0;

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages?: number }> {
  // pdf-parse v2 exposes PDFParse class, not a default function
  const mod = (await import("pdf-parse")) as unknown as {
    PDFParse: new (opts: { data: Uint8Array }) => {
      getText(): Promise<{ text: string; numpages: number }>;
      destroy(): Promise<void>;
    };
  };
  const parser = new mod.PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return { text: result.text ?? "", pages: result.numpages };
  } finally {
    await parser.destroy();
  }
}

const OCR_PROMPT = `Transcribe every legible word from this document, top-to-bottom, left-to-right. Preserve paragraph breaks. Include hand-written notes, letterheads, and stamps when readable. Do not summarize, explain, or add commentary. If a page is blank or unreadable, output "[blank page]". Output raw text only.`;

async function ocrPdfWithGemini(buffer: Buffer): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");
  if (buffer.byteLength > GEMINI_INLINE_MAX_BYTES) {
    throw new Error(`PDF too large for inline Gemini OCR (${buffer.byteLength} bytes)`);
  }
  const { GoogleGenAI } = await import("@google/genai");
  const genai = new GoogleGenAI({ apiKey });

  // Pace global OCR traffic to stay under Gemini's RPM quota.
  const waitMs = OCR_MIN_INTERVAL_MS - (Date.now() - lastOcrCallAt);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  lastOcrCallAt = Date.now();

  // Retry on 429/5xx with exponential backoff + jitter.
  const maxAttempts = 5;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await genai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } },
              { text: OCR_PROMPT },
            ],
          },
        ],
      });
      return (res.text ?? "").trim();
    } catch (err) {
      lastErr = err as Error;
      const msg = lastErr.message || "";
      const isRateLimit = /429|quota|rate/i.test(msg);
      const isTransient = isRateLimit || /5\d\d|timeout|ETIMEDOUT|ECONNRESET/i.test(msg);
      if (!isTransient || attempt === maxAttempts) throw lastErr;
      const base = isRateLimit ? 8000 : 2000;
      const delay = base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 1000);
      console.warn(`    Gemini ${isRateLimit ? "rate-limited" : "transient error"}, retry ${attempt}/${maxAttempts} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr ?? new Error("OCR failed");
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; EpsteinVizBot/1.0; research purposes)",
      // Age-gate cookie required for justice.gov/epstein documents
      "Cookie": "justiceGovAgeVerified=true",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/html")) {
    throw new Error(`Got HTML instead of file (age gate or redirect?) for ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkText(
  text: string
): Array<{ text: string; token_count: number; content_hash: string }> {
  // Prefer splitting on paragraph boundaries within the size target
  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).length > CHARS_PER_CHUNK && current.length > 0) {
      chunks.push(current.trim());
      // Overlap: keep last CHUNK_OVERLAP_CHARS of current chunk
      current = current.slice(-CHUNK_OVERLAP_CHARS) + "\n\n" + para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks
    .filter((c) => c.length > 30)
    .map((text) => ({
      text,
      token_count: Math.round(text.length / 4),
      content_hash: createHash("sha256").update(text).digest("hex"),
    }));
}

// ---------------------------------------------------------------------------
// Process one document
// ---------------------------------------------------------------------------

async function processDocument(
  doc: { id: string; source_url: string; file_type: string | null },
  supabase: ReturnType<typeof createServiceClient>
) {
  console.log(`  Processing: ${doc.source_url}`);

  // Mark as downloading
  await supabase
    .from("epstein_documents")
    .update({ status: "downloading" })
    .eq("id", doc.id);

  let rawText: string;
  let pageCount: number | undefined;
  let textSource: "pdf_parse" | "gemini_ocr" | "empty" = "empty";
  let buffer: Buffer | null = null;

  try {
    buffer = await downloadBuffer(doc.source_url);

    if (doc.file_type === "pdf" || doc.source_url.endsWith(".pdf")) {
      const { text, pages } = await extractPdfText(buffer);
      rawText = text;
      pageCount = pages;
      if (text.trim().length >= EMPTY_TEXT_THRESHOLD) {
        textSource = "pdf_parse";
      }
    } else {
      rawText = buffer.toString("utf-8");
      if (rawText.trim().length >= EMPTY_TEXT_THRESHOLD) textSource = "pdf_parse";
    }
  } catch (err) {
    await supabase
      .from("epstein_documents")
      .update({ status: "failed", error: (err as Error).message })
      .eq("id", doc.id);
    console.warn(`    Failed download/extract: ${(err as Error).message}`);
    return;
  }

  // Fallback: if pdf-parse yielded near-nothing, try Gemini OCR.
  if (textSource === "empty" && buffer && (doc.file_type === "pdf" || doc.source_url.endsWith(".pdf"))) {
    try {
      const ocrText = await ocrPdfWithGemini(buffer);
      if (ocrText.length >= OCR_KEEP_THRESHOLD) {
        rawText = ocrText;
        textSource = "gemini_ocr";
        console.log(`    OCR recovered ${ocrText.length} chars`);
      } else {
        console.log(`    OCR too short (${ocrText.length} chars) — likely blank/bates-only scan`);
      }
    } catch (err) {
      console.warn(`    OCR failed: ${(err as Error).message}`);
    }
  }

  // Store raw text + mark extracted
  await supabase
    .from("epstein_documents")
    .update({
      raw_text: rawText,
      page_count: pageCount ?? null,
      status: "extracted",
      text_source: textSource,
      downloaded_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  // If this is a reprocess, drop previous chunks for this doc so indices stay clean.
  // Cascade deletes epstein_mentions pointing at these chunks.
  await supabase.from("epstein_chunks").delete().eq("document_id", doc.id);

  // Chunk
  const chunks = chunkText(rawText);
  if (!chunks.length) {
    await supabase
      .from("epstein_documents")
      .update({ status: "chunked" })
      .eq("id", doc.id);
    return;
  }

  // Upsert chunks (ignore duplicates by content_hash)
  const rows = chunks.map((c, i) => ({
    document_id: doc.id,
    chunk_index: i,
    ...c,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const { error } = await supabase
      .from("epstein_chunks")
      .upsert(rows.slice(i, i + 50), {
        onConflict: "content_hash",
        ignoreDuplicates: true,
      });
    if (error) console.warn(`    Chunk upsert error: ${error.message}`);
  }

  await supabase
    .from("epstein_documents")
    .update({ status: "chunked" })
    .eq("id", doc.id);

  console.log(`    OK [${textSource}] — ${pageCount ?? "?"} pages → ${chunks.length} chunks`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const limit = parseInt(
    args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "10",
    10
  );
  const concurrency = parseInt(
    args.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? "3",
    10
  );
  const reprocessEmpty = args.includes("--reprocess-empty");

  const supabase = createServiceClient();

  // Pick the fetch query based on mode.
  // - default: docs with status='pending' (fresh crawl)
  // - --reprocess-empty: docs already processed but with near-empty raw_text
  //   (scanned PDFs that need OCR).
  let query = supabase
    .from("epstein_documents")
    .select("id, source_url, file_type, raw_text");

  if (reprocessEmpty) {
    query = query
      .in("status", ["chunked", "extracted", "failed"])
      .or(`text_source.is.null,text_source.eq.empty`);
  } else {
    query = query.eq("status", "pending");
  }

  const { data: docsRaw, error } = await query.limit(limit);

  // Client-side filter for reprocess-empty: keep only docs where raw_text is truly short.
  const docs = reprocessEmpty
    ? (docsRaw ?? []).filter((d: { raw_text: string | null }) => (d.raw_text?.length ?? 0) < EMPTY_TEXT_THRESHOLD)
    : docsRaw;

  if (error) {
    console.error("Failed to fetch pending documents:", error.message);
    process.exit(1);
  }

  if (!docs?.length) {
    console.log(
      reprocessEmpty
        ? "No empty-text documents to reprocess."
        : "No pending documents. Run crawl.ts first."
    );
    return;
  }

  console.log(
    `Processing ${docs.length} documents${reprocessEmpty ? " (reprocess-empty mode)" : ""} (concurrency=${concurrency})...`
  );

  // Process in batches of `concurrency`
  for (let i = 0; i < docs.length; i += concurrency) {
    const batch = docs.slice(i, i + concurrency);
    await Promise.all(batch.map((doc) => processDocument(doc, supabase)));
  }

  console.log("\nIngest complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
