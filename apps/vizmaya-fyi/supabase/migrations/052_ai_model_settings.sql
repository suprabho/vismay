-- Per-AI-feature model overrides, set from the admin "AI models" page.
--
-- One row per feature surface (e.g. 'assistant', 'evaluate', 'generateSection').
-- `model_alias` is an @vismay/ai-gateway alias (text.* / image.*). A feature
-- with no row falls back to the code default in lib/aiModelSettings.ts.
--
-- Service-role only, written from the auth-gated admin API. No RLS — matches
-- ai_generations / assistant_conversations.

create table if not exists ai_model_settings (
  feature     text primary key,
  model_alias text not null,
  updated_at  timestamptz not null default now()
);
