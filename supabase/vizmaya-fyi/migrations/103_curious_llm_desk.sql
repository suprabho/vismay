-- 103_curious_llm_desk.sql — the Curious Desk's LLM path.
--
-- The nightly collectors (GDELT, Library of Congress, Europeana, Gallica)
-- were wound down on 2026-11-05. Claims now come from an on-demand LLM run
-- (packages/curious-pipeline/src/llm.ts, started from the admin Curious
-- claims tab or `pnpm curious:generate`): a model researches with the AI
-- Gateway's web search and proposes claims citing the pages it found, each
-- cited page is read once under robots.txt, and a second model checks the
-- claim against those pages, grades it A to E and picks a verbatim evidence
-- quote that must be found in the page. Claims land in the same review queue.
--
-- This migration adds the 'web-search' source row and lets a claim source be
-- verified by 'llm-check'. Additive and idempotent; safe to re-run.

insert into curious_sources (id, name, kind, base_url, allowed_method, crawl_delay_ms, rate_per_min, retention_days, commercial_reuse, fulltext_storage, personal_data_policy, terms_url, terms_last_checked, enabled, notes) values
  ('web-search', 'Web search (LLM desk)', 'web', null, 'api', 2000, 20, 0, false, 'none', 'public-figures', 'https://vercel.com/docs/ai-gateway', '2026-11-05', true,
   'Pages a model found through the AI Gateway''s Perplexity search. Each cited page is fetched once under robots.txt to check the evidence quote; only the quote (at most 300 characters) is stored.')
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, allowed_method = excluded.allowed_method, crawl_delay_ms = excluded.crawl_delay_ms,
  rate_per_min = excluded.rate_per_min, retention_days = excluded.retention_days, fulltext_storage = excluded.fulltext_storage,
  terms_url = excluded.terms_url, terms_last_checked = excluded.terms_last_checked, enabled = excluded.enabled,
  notes = excluded.notes, updated_at = now();

alter table curious_claim_sources drop constraint if exists curious_claim_sources_verified_by_check;
alter table curious_claim_sources add constraint curious_claim_sources_verified_by_check
  check (verified_by in ('detector','verify-crossref','verify-books','verify-wikidata','human','llm-check'));
