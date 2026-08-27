-- Footshorts: Opta Power Rankings scraped weekly from theanalyst.com
--
-- Each scrape that finds changed content INSERTS a new snapshot row (a timeline,
-- like daily_recaps — no upsert-in-place), landing as status='draft' for
-- editorial review in the admin app. Publishing is an explicit admin action
-- that flips status to 'published' (same lifecycle as footshorts_share_cards);
-- consumer surfaces only ever see published rows via RLS.
--
-- rankings jsonb shape: [{ rank, team_name, resolved_entity_id, score,
-- movement, competition }] — team_name is theanalyst's label verbatim,
-- resolved_entity_id is our entities(id) when the resolver matched it (null
-- otherwise, fixable by an editor before publishing).
--
-- content_hash: sha256 of the parsed ranking list + narrative source text.
-- Dedupe is application-level (the worker skips inserting when the latest row
-- for the same source_url carries the same hash) rather than a unique
-- constraint, so a legitimate identical re-publish in a later week stays
-- possible and the table keeps its per-run timeline semantics.

create table if not exists power_rankings (
  id            uuid primary key default gen_random_uuid(),
  source_url    text not null,
  week_label    text,                 -- theanalyst's own label if present, else ISO week of the scrape
  rankings      jsonb not null,
  narrative     text,                 -- short Gemini abstractive summary — never the full article text
  content_hash  text not null,
  scraped_at    timestamptz not null default now(),
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_power_rankings_scraped_at on power_rankings (scraped_at desc);

-- RLS: only published rows are publicly readable; drafts are admin-only
-- (service-role reads from isAuthed()-gated admin routes). Writes are
-- service-role only — no public insert/update/delete policy.

alter table power_rankings enable row level security;

drop policy if exists "power_rankings: public read published" on power_rankings;
create policy "power_rankings: public read published"
  on power_rankings for select using (status = 'published');

grant all on public.power_rankings to anon, authenticated, service_role;
