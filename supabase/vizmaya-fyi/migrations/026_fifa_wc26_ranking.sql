-- FIFA Men's World Ranking position for each qualified team. Nullable so the
-- column lands cleanly without forcing a same-tx data refresh. Populated by
-- scripts/fifa-wc26/import.ts from the "FIFA Ranking" column in
-- vizmaya-data/FIFA/wc2026_master.csv. Rankings change monthly; treat each
-- import as a fresh snapshot.

alter table fifa_wc26_teams
  add column if not exists fifa_ranking integer;
