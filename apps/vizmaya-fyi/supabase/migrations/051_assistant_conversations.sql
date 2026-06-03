-- Server-stored history for the admin platform assistant (the "✨ Ask" panel).
--
-- The assistant used to be stateless — the thread lived only in React state and
-- was lost on close/reload. These two tables persist it so an author can revisit
-- past conversations, and so we accumulate a corpus for evals.
--
-- Auth in admin is single-admin (a cookie, no per-user identity), so there is no
-- user_id column — every row belongs to "the admin". RLS stays off, matching
-- ai_generations: these tables are service-role-only, written from API routes
-- that already gate on the admin cookie.
--
-- assistant_messages stores ONE row per turn. `meta` is free-form: the assistant
-- turn carries { model }, and the user turn carries the attached context
-- ({ node, section, selectedText }) captured when the question was asked.

create table if not exists assistant_conversations (
  id          uuid primary key default gen_random_uuid(),
  -- Auto-derived from the first user message; editable later if we add rename.
  title       text not null default 'New conversation',
  -- The story the author was editing when the thread started, if any.
  story_slug  text,
  created_at  timestamptz not null default now(),
  -- Bumped on every new message so the history list can sort by recency.
  updated_at  timestamptz not null default now()
);

create table if not exists assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references assistant_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  meta            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- "Load this conversation's turns in order" — the message-fetch query.
create index if not exists assistant_messages_conversation_idx
  on assistant_messages (conversation_id, created_at);

-- "List recent conversations, newest first" — drives the history panel.
create index if not exists assistant_conversations_updated_idx
  on assistant_conversations (updated_at desc);
