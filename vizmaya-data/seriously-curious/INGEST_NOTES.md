# Seriously Curious — ingest notes

Source-of-record for the scrape, the per-field provenance, and the gotchas.

## Source

`vizmaya-data/Seriously Curious The Facts and Figures That Turn Our World
Upside Down.pdf` — 274 pages, PDF 1.5, text layer intact (not scanned), so
no OCR was needed. Producer metadata: pdftk-java / iText (a re-exported
e-book). No embedded title/author metadata.

## How `articles.json` was built

Extracted with **PyMuPDF (`fitz`)**, driven by the PDF's own table of
contents (`doc.get_toc()`):

1. **Structure from the TOC.** 17 level-1 entries; the 7 front/back-matter
   ones (Cover, Title Page, Copyright, Contents, Introduction, Contributors,
   Index) have no level-2 children and are dropped. The remaining **10** are
   the thematic sections; their **109** level-2 children are the articles.
2. **Page spans.** Each article runs from its TOC start page to the next
   article/section boundary (1–4 pages, avg 2.1).
3. **Title-anchored slicing.** Because two short articles can share a page,
   the body isn't "all text on the span" — it's the text *between this
   article's title and the next title* within the concatenated span (quotes
   and dashes normalized for the match). This is what keeps neighbours from
   bleeding into each other; verified clean at every section boundary and on
   shared pages.
4. **Cleanup.** De-hyphenate line-break splits (`ac-\ncount` → `account`),
   join wrapped lines into paragraphs, collapse runs of whitespace.

Result: 109 bodies, none truncated, avg ~2,990 chars (~500 words), total
~325k chars.

## Tagging (`entities` / `keywords` / `facts`)

Heuristic, deterministic (no LLM) — supplementary metadata; the composer
provider searches `title` + `body`, so these are for display/filtering, not
the primary retrieval key.

- **`entities`** — matched against a curated country/region + organisation
  gazetteer (avg 2.7/article).
- **`keywords`** — top content terms after stop-word removal.
- **`facts`** — up to 4 whole-sentence numeric pull-quotes (sentences with a
  figure / %, $, superlative). The sentence splitter protects decimals
  ("6.6 gigatons") and initials so quotes stay whole. 4 of 109 articles carry
  no numeric fact (they're qualitative) — expected, left empty.

> **Upgrade path:** for canonical topic tags + cleaner one-line facts, a cheap
> LLM pass over the 109 short articles can overwrite `keywords`/`facts`
> in-place before import. Not done for v1 — the heuristic layer is adequate
> because retrieval keys off full text.

## Gotchas

- **Curly punctuation.** Titles keep the book's typographic apostrophes/quotes
  (`don't`, `"death taxes"`). Slugs strip them. Match on normalized forms.
- **Decimal figures** split naive sentence tokenizers — handled (see above).
- **Copyright.** This is a commercial book. Stored as a private editorial
  corpus to ground composed stories; do not republish bodies verbatim and
  keep the epic `draft`/hidden.
