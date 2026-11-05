-- 104_curious_book_source.sql — source books as a Curious Desk source.
--
-- Seeds the 'book' row of the source policy registry (mirrored in
-- packages/curious-pipeline/src/policy.ts) so the claim store can hold facts
-- quoted from an editorial source book. The first is Seriously Curious (The
-- Economist, ed. Tom Standage, Profile Books 2018, ISBN 9781788161367), the
-- corpus behind book_articles (migration 068): one curious_documents row per
-- article, one claim per standalone fact sentence, each with that sentence
-- (at most 300 characters) as its evidence quote and isbn:9781788161367 as
-- its single lineage. Nothing is fetched from anywhere.
--
-- Writer: apps/vizmaya-fyi/scripts/curious/seed-book.ts (pnpm curious:seed-book)
--
-- Additive and idempotent; safe to re-run.

insert into curious_sources (id, name, kind, base_url, allowed_method, crawl_delay_ms, rate_per_min, retention_days, commercial_reuse, fulltext_storage, personal_data_policy, terms_url, terms_last_checked, enabled, notes) values
  ('book', 'Source books', 'library', null, 'none', 0, null, 3650, false, 'snippet', 'public-figures', null, '2026-11-05', true,
   'Editorial source books held in vizmaya-data/<book>/ (Seriously Curious first). Seeded by script, never fetched. A copyrighted book: only the quoted fact sentence (at most 300 characters) is stored as evidence; the article body stays in book_articles.')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, allowed_method = excluded.allowed_method, crawl_delay_ms = excluded.crawl_delay_ms,
  rate_per_min = excluded.rate_per_min, retention_days = excluded.retention_days, commercial_reuse = excluded.commercial_reuse,
  fulltext_storage = excluded.fulltext_storage, terms_last_checked = excluded.terms_last_checked, enabled = excluded.enabled,
  notes = excluded.notes, updated_at = now();
