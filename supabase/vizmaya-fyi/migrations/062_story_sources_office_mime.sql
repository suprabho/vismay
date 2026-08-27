-- Allow Office + EPub source uploads in the story-sources bucket.
--
-- The compose source extractor now routes PDFs, Office documents
-- (Word/PowerPoint/Excel) and EPub through markitdown in the extraction worker
-- (see apps/admin/scripts/extract-compose-source.ts). The story-sources bucket's
-- allowed_mime_types allowlist (migration 056) predates that and only permitted
-- PDF/text/html/csv/json/eml/images, so an .xlsx/.docx/.pptx/.epub upload was
-- rejected by storage BEFORE the worker ran ("mime type ... is not supported").
--
-- Widen the allowlist to the formats the worker can now extract. Idempotent:
-- re-states the full array via update, matching the create in 056.

update storage.buckets
  set allowed_mime_types = array[
        -- existing (migration 056)
        'application/pdf',
        'text/plain',
        'text/markdown',
        'text/html',
        'text/csv',
        'application/json',
        'message/rfc822',
        'image/png',
        'image/jpeg',
        'image/webp',
        -- Office (markitdown via the extraction worker)
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
        'application/vnd.ms-excel',                                           -- .xls
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
        'application/msword',                                                 -- .doc
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', -- .pptx
        'application/vnd.ms-powerpoint',                                      -- .ppt
        -- EPub
        'application/epub+zip'
      ]
  where id = 'story-sources';
