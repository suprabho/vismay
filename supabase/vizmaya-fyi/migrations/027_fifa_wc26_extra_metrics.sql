-- Two more metric columns from the wc2026_master CSV update:
--   ghi_2025_score  — Global Hunger Index 2025 (lower is better; null for
--                     countries the report excludes, e.g. USA, UK, Canada,
--                     France — high-income nations are not scored)
--   whr_2025_rank   — World Happiness Report 2025 global rank
--
-- Both nullable. Populated by scripts/fifa-wc26/import.ts from the
-- "GHI 2025 Score" and "WHR 2025 Rank" columns in
-- vizmaya-data/FIFA/wc2026_master.csv. Each import is a fresh snapshot.

alter table fifa_wc26_teams
  add column if not exists ghi_2025_score double precision,
  add column if not exists whr_2025_rank  integer;
