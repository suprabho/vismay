-- Expanded narrative + seed protection for substories

alter table epstein_substories
  add column if not exists narrative text,
  add column if not exists is_seed   boolean not null default false;
