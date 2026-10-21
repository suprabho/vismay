-- Club marks, round 2 (all additive): a third kit colour (trim), the ring and shield
-- families, the sleeves and chestband patterns, and — as a prototype — a charge (a
-- house-drawn emblem from @vismay/club-marks' charges library, set by hand).
--
--   kit_trim                  data/kits.csv trim (pushed by history:club-marks-sync)
--   seed_family, seed_charge  data/mark_overrides.csv (editorial defaults, pushed the same way)
--   override_trim, override_charge   the admin review queue
--   trim, charge              the generated row

alter table public.admin_club_marks
  add column if not exists kit_trim text not null default '',
  add column if not exists seed_family text,
  add column if not exists seed_charge text,
  add column if not exists override_trim text,
  add column if not exists override_charge text,
  add column if not exists trim text,
  add column if not exists charge text;

alter table public.admin_club_marks drop constraint if exists admin_club_marks_override_family_check;
alter table public.admin_club_marks add constraint admin_club_marks_override_family_check
  check (override_family in ('roundel', 'ring', 'heater', 'shield', 'oval', 'plate'));
alter table public.admin_club_marks drop constraint if exists admin_club_marks_seed_family_check;
alter table public.admin_club_marks add constraint admin_club_marks_seed_family_check
  check (seed_family in ('roundel', 'ring', 'heater', 'shield', 'oval', 'plate'));
alter table public.admin_club_marks drop constraint if exists admin_club_marks_override_pattern_check;
alter table public.admin_club_marks add constraint admin_club_marks_override_pattern_check
  check (override_pattern in ('solid', 'stripes', 'hoops', 'halves', 'sash', 'band', 'quarters', 'sleeves', 'chestband'));
