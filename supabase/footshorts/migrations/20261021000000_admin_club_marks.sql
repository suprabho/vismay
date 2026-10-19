-- Club marks for the football-seasons books (Club Mark Generator spec): per club and season,
-- the home kit (from data/kits.csv), the editor's overrides from the admin review queue, and
-- the generated club-mark row (toClubMark() in @vismay/club-marks): a crest-family shape,
-- the kit pattern in two colours, a 3-letter code. The real crest is only read to classify the
-- family; nothing of it is stored here. Renders are not stored: surfaces draw from the row.
-- Research material only: no consumer access, never published.
--
-- Kit columns come from `pnpm --filter @footshorts/worker history:club-marks-sync -- --season=2003 --push`
-- (never touching overrides or the mark); `--pull` writes the marks to data/club_marks.csv.

create table if not exists public.admin_club_marks (
  season text not null,
  wiki text not null,
  -- Home kit (data/kits.csv)
  kit_pattern text not null default '',     -- solid | stripes | hoops | halves | sash | band | quarters | '' (none)
  kit_c1 text not null default '',
  kit_c2 text not null default '',
  kit_confidence real,
  kit_source text not null default '',      -- season | club (today's kit) | override | none
  kit_page text not null default '',
  kit_needs_review boolean not null default false,
  kit_note text not null default '',
  -- Review-queue overrides, written back into toClubMark's input
  override_family text check (override_family in ('roundel', 'heater', 'oval', 'plate')),
  override_code text,
  override_pattern text check (override_pattern in ('solid', 'stripes', 'hoops', 'halves', 'sash', 'band', 'quarters')),
  override_c1 text,
  override_c2 text,
  reviewed_by text,
  reviewed_at timestamptz,
  -- The mark (status ok) or why there is none (status error: E_NO_KIT, …)
  status text check (status in ('ok', 'error')),
  error_code text,
  error_message text,
  code text,
  crest text,
  pattern text,
  c1 text,
  c2 text,
  league text,
  era_from int,
  era_to int,
  family_confidence real,
  checks jsonb,                             -- the six checks: [{ id, label, status, detail }]
  print jsonb,                              -- nearest print-palette swatches: { c1: { token, hex, cmyk, deltaE }, c2 }
  needs_review boolean not null default false,
  review_reasons text[] not null default '{}',
  alt text,
  spec_version text,
  generated_from text,                      -- the crest the family was read from ("upload:<path>@<at>" or its URL)
  generated_by text,
  generated_at timestamptz,
  primary key (season, wiki),
  foreign key (season, wiki) references public.admin_season_crests (season, wiki) on delete cascade
);

alter table public.admin_club_marks enable row level security;
revoke all on public.admin_club_marks from public, anon, authenticated;
grant select, insert, update, delete on public.admin_club_marks to service_role;
comment on table public.admin_club_marks is
  'Football-seasons book club marks (kit, overrides, generated row): private admin review only. No publishing or consumer access.';
