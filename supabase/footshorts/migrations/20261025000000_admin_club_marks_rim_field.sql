-- Club marks, spec 2.2 (Oct 21 2026): the marks redrawn in Figma become generator rows.
-- A mark now has a rim of 0–3 bands ("#HEX@width;…", "none", or '' for the default ring
-- + white gap), a hexagon family, library emblems among its charges, and an editorial
-- field (pattern/c1/c2) that can differ from the kit. Additive and idempotent.
--
--   seed_rim, seed_pattern, seed_c1, seed_c2   data/mark_overrides.csv (pushed by history:club-marks-sync)
--   override_rim                               the admin review queue
--   rim                                        the generated row

alter table public.admin_club_marks
  add column if not exists seed_rim text,
  add column if not exists seed_pattern text,
  add column if not exists seed_c1 text,
  add column if not exists seed_c2 text,
  add column if not exists override_rim text,
  add column if not exists rim text;

alter table public.admin_club_marks drop constraint if exists admin_club_marks_override_family_check;
alter table public.admin_club_marks add constraint admin_club_marks_override_family_check
  check (override_family in ('roundel', 'heater', 'oval', 'plate', 'hexagon'));
alter table public.admin_club_marks drop constraint if exists admin_club_marks_seed_family_check;
alter table public.admin_club_marks add constraint admin_club_marks_seed_family_check
  check (seed_family in ('roundel', 'heater', 'oval', 'plate', 'hexagon'));
