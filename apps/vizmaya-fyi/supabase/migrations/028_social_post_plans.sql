-- Outbound social post planner. One row per scheduled post.
--
-- Channels: x | linkedin | youtube. asset_ref is JSONB matching the AssetRef
-- union in lib/socialPostPlans.ts (share_card / share_card_carousel /
-- slides_pdf / autoplay_video). Status flips manually — this table is
-- record-keeping only; nothing in this phase auto-publishes.
--
-- story_slug nullable on delete so removing a story doesn't drop history; the
-- asset_ref snapshot remains so the row can render a "(story removed)" chip.

create table if not exists social_post_plans (
  id              uuid primary key default gen_random_uuid(),
  scheduled_date  date not null,
  scheduled_time  time,
  channel         text not null check (channel in ('x','linkedin','youtube')),
  -- intentionally not a FK: fs-backed content may not have a `stories` row.
  -- Reads cope with `null` (renders as "(story removed)").
  story_slug      text,
  asset_ref       jsonb not null,
  post_text       text not null default '',
  status          text not null default 'scheduled'
                    check (status in ('draft','scheduled','posted','cancelled')),
  posted_at       timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists social_post_plans_scheduled_date_idx
  on social_post_plans (scheduled_date);

create index if not exists social_post_plans_status_idx
  on social_post_plans (status, scheduled_date);

create or replace function social_post_plans_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists social_post_plans_touch on social_post_plans;
create trigger social_post_plans_touch
  before update on social_post_plans
  for each row execute function social_post_plans_touch_updated_at();
