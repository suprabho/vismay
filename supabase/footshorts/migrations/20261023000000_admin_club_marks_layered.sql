-- Club marks, spec 2 (toClubMark, Oct 2026): the layered mark — ring, white gap, kit field,
-- white disc holding one plain geometric charge. Original marks only: nothing is drawn from
-- a badge. Additive and idempotent (shared Supabase project).
--
--   ring       the generated ring colour (c2 if dark enough, else a darkened c1)
--   charge     now "shape:#hex" — circle | triangle | triangle-down | square | diamond | bar | chevron
--   families   roundel | heater | oval | plate (round 2's ring → roundel, shield → heater)
--   patterns   solid | stripes | hoops | halves | sleeves | band (sash, chestband → band; quarters → halves)
-- The trim columns stay (unused) so nothing is dropped.

alter table public.admin_club_marks add column if not exists ring text;

update public.admin_club_marks set override_family = case override_family when 'ring' then 'roundel' when 'shield' then 'heater' else override_family end
  where override_family in ('ring', 'shield');
update public.admin_club_marks set seed_family = case seed_family when 'ring' then 'roundel' when 'shield' then 'heater' else seed_family end
  where seed_family in ('ring', 'shield');
update public.admin_club_marks set override_pattern = case override_pattern when 'quarters' then 'halves' else 'band' end
  where override_pattern in ('sash', 'chestband', 'quarters');
update public.admin_club_marks set kit_pattern = case kit_pattern when 'quarters' then 'halves' else 'band' end
  where kit_pattern in ('sash', 'chestband', 'quarters');
-- Round 2's emblem charges (lion, cannon, …) are not plain shapes: clear them.
update public.admin_club_marks set seed_charge = null where seed_charge is not null and seed_charge !~ '^(circle|triangle|triangle-down|square|diamond|bar|chevron):#[0-9A-Fa-f]{6}$';
update public.admin_club_marks set override_charge = null where override_charge is not null and override_charge !~ '^(circle|triangle|triangle-down|square|diamond|bar|chevron):#[0-9A-Fa-f]{6}$';
update public.admin_club_marks set charge = null where charge is not null and charge !~ '^(circle|triangle|triangle-down|square|diamond|bar|chevron):#[0-9A-Fa-f]{6}$';

alter table public.admin_club_marks drop constraint if exists admin_club_marks_override_family_check;
alter table public.admin_club_marks add constraint admin_club_marks_override_family_check
  check (override_family in ('roundel', 'heater', 'oval', 'plate'));
alter table public.admin_club_marks drop constraint if exists admin_club_marks_seed_family_check;
alter table public.admin_club_marks add constraint admin_club_marks_seed_family_check
  check (seed_family in ('roundel', 'heater', 'oval', 'plate'));
alter table public.admin_club_marks drop constraint if exists admin_club_marks_override_pattern_check;
alter table public.admin_club_marks add constraint admin_club_marks_override_pattern_check
  check (override_pattern in ('solid', 'stripes', 'hoops', 'halves', 'sleeves', 'band'));
alter table public.admin_club_marks drop constraint if exists admin_club_marks_override_charge_check;
alter table public.admin_club_marks add constraint admin_club_marks_override_charge_check
  check (override_charge ~ '^(circle|triangle|triangle-down|square|diamond|bar|chevron):#[0-9A-Fa-f]{6}$');
