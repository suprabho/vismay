-- App scoping + carousel grouping for vizmaya_share_cards (migration 061).
--
-- The share-card composer now serves more than one app: umami's "Social frames"
-- (comparison posts, dish spotlights, multi-frame explainer carousels) reuse the
-- same composer + table. `app_slug` scopes each row to the app whose editor
-- saved it — legacy vizmaya rows stay null and the vizmaya library filters on
-- `app_slug is null`, so nothing moves.
--
-- A carousel is an ordered group of ordinary card rows: every frame is its own
-- row (keeps the per-config size guard and reuses card CRUD verbatim) linked by
-- `carousel_id` with `carousel_position` for ordering. The row ids double as the
-- social planner's `share_card_carousel.cardIds[]`.

alter table vizmaya_share_cards
  add column if not exists app_slug text,
  add column if not exists carousel_id uuid,
  add column if not exists carousel_position int;

create index if not exists idx_vizmaya_share_cards_app
  on vizmaya_share_cards (app_slug);

create index if not exists idx_vizmaya_share_cards_carousel
  on vizmaya_share_cards (carousel_id, carousel_position);
