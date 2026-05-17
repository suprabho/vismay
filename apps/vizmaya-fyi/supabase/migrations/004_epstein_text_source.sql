-- Track which extraction path produced raw_text so we can distinguish
-- pdf-parse (embedded text) from Gemini OCR fallback (scanned PDFs).
alter table epstein_documents
  add column if not exists text_source text
  check (text_source in ('pdf_parse', 'gemini_ocr', 'empty'));

create index if not exists idx_epstein_documents_text_source
  on epstein_documents(text_source);
