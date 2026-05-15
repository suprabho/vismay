# Social Engagement Dashboard — Implementation Plan

A unified dashboard for tracking mentions, replies, and engagement across Reddit, YouTube, LinkedIn, and X. Built on Next.js + Supabase + Gemini.

> **Status (2026-05-15):** v1 landed inside the existing `/admin` (Social tab). Reddit deferred. YouTube + LinkedIn/X (email) ingesting. AI scoring + digest + trends deferred — see "v1 as shipped" below.

## v1 as shipped — quick reference

**Where it lives**
- Admin tab: `/admin/social` → [app/admin/(tabbed)/social/page.tsx](../app/admin/(tabbed)/social/page.tsx) + `SocialInbox.tsx`
- Tab nav: [components/admin/AdminTabs.tsx](../components/admin/AdminTabs.tsx) (4th entry)

**Schema** (migration `028_social_engagement.sql`) — single `engagement_event` table, blob-shaped per the original plan, plus `parent_external_id` / `parent_url` / `parent_content` so the dashboard can group by post. No AI columns yet (no `needs_reply`, `ai_priority`, `ai_summary`) — add in a follow-up migration when Phase 6 lands.

**Shared lib:** [lib/socialEngagement.ts](../lib/socialEngagement.ts) — types (`Platform`, `Status`, `EngagementEvent`, `NormalizedEvent`), `upsertEvents`, `listEvents`, `updateStatus`, `summarize`.

**Ingest paths**
- **YouTube:** [scripts/social/ingest-youtube.ts](../scripts/social/ingest-youtube.ts) — pulls comments + replies on the channel's last 50 uploads via Data API v3. Runs every 30 min via [.github/workflows/social-ingest-youtube.yml](../.github/workflows/social-ingest-youtube.yml). Idempotent on `(youtube, comment_id)`.
- **LinkedIn + X:** [lib/socialEmailParse.ts](../lib/socialEmailParse.ts) → [app/api/ingest/email/route.ts](../app/api/ingest/email/route.ts). Notification emails arrive at a subdomain, get forwarded by a Cloudflare Email Worker ([scripts/social/cloudflare-email-worker.js](../scripts/social/cloudflare-email-worker.js)) to the route, which parses with `mailparser` and extracts fields via Gemini.

**Status flow:** every row starts `status='new'`. Inbox row dropdown switches to `seen / replied / dismissed` via `PUT /api/admin/social/:id`.

### Env vars to set

**Vercel (Production):**
- `SOCIAL_INGEST_SECRET` — random 32+ char string; same value goes into the Cloudflare Worker as `INGEST_SECRET`.
- `GEMINI_API_KEY` — already set for energy-profile / render-audio; reused here.
- (Supabase vars already configured.)

**GitHub repo secrets (Production environment):**
- `YOUTUBE_API_KEY` — Data API v3 key, read-only is fine.
- `YOUTUBE_CHANNEL_ID` — the channel to ingest comments from.

**Cloudflare Worker (secrets):**
- `INGEST_URL` — `https://vizmaya.fyi/api/ingest/email`
- `INGEST_SECRET` — matches `SOCIAL_INGEST_SECRET` in Vercel.

### Cloudflare Email Worker setup

1. Pick a subdomain you control (e.g. `in.promad.design`) and add it to Cloudflare with email routing enabled.
2. `wrangler init social-ingest`, paste [scripts/social/cloudflare-email-worker.js](../scripts/social/cloudflare-email-worker.js) as `src/worker.js`, set the two secrets, deploy.
3. In Cloudflare's email routing UI, point `social-ingest@<subdomain>` at the Worker.
4. Forward LinkedIn / X notification emails from your main inbox to `social-ingest@<subdomain>` (or change the notification address on those platforms directly).

### Manual run / smoke tests

- YouTube: `pnpm social:ingest-youtube`
- Email parse (without Cloudflare): `curl -X POST https://vizmaya.fyi/api/ingest/email -H "authorization: Bearer $SOCIAL_INGEST_SECRET" -H "content-type: message/rfc822" --data-binary @sample-linkedin.eml`

### Deferred from this pass

| Phase | What | Why deferred |
|---|---|---|
| 1 | Reddit ingest | User asked to skip — not currently active there. |
| 6 | AI priority scoring (`needs_reply`, `ai_priority`, `ai_summary`) | Wanted hard data first; layer AI on top once the inbox proves useful. |
| 7 | Daily digest email | Same — defer until there's enough volume to be worth summarising. |
| 8 | Trends, top posts, response-time, keyboard shortcuts, snooze, dark mode | Polish layer. |

---


---

## Goal

Replace the daily ritual of opening four apps to check notifications with a single dashboard that:
- Ingests engagement events from all four platforms
- Flags what needs a reply vs what's just noise
- Generates a morning digest of yesterday's activity
- Tracks engagement trends over time

**Non-goal (v1):** Replying from the dashboard. Triage-only with deep links to the native platform.

---

## Architecture

```
┌─────────────────┐
│  Reddit API     │──┐
├─────────────────┤  │
│  YouTube API    │──┤
├─────────────────┤  ├──→ Ingest workers ──→ Supabase ──→ Next.js dashboard
│  Email parser   │──┤    (Vercel cron)      (Postgres)    (Tailwind + Phosphor)
│  (LinkedIn/X)   │  │           │
└─────────────────┘──┘           ↓
                          Gemini 2.5 Flash
                          (priority + digest)
```

**Single unified schema** — every platform's events normalize into one `engagement_event` table so the dashboard is platform-agnostic.

---

## Data Model

```sql
create table engagement_event (
  id uuid primary key default gen_random_uuid(),
  platform text not null,           -- reddit | youtube | linkedin | x
  external_id text not null,        -- platform's own ID for dedupe
  type text not null,               -- mention | reply | comment | dm
  source_url text,
  author_handle text,
  author_metadata jsonb,            -- follower count, verified, etc.
  content text,
  parent_content text,              -- the post/comment being replied to
  created_at timestamptz not null,
  ingested_at timestamptz default now(),
  needs_reply boolean default false,
  ai_priority text,                 -- low | medium | high
  ai_summary text,
  status text default 'new',        -- new | seen | replied | dismissed
  unique(platform, external_id)
);

create index on engagement_event (status, created_at desc);
create index on engagement_event (platform, created_at desc);
create index on engagement_event (ai_priority) where status = 'new';
```

---

## Phase 0 — Foundations (2 hours)

- [ ] Create Next.js 15 project: `pnpm create next-app social-dash --typescript --tailwind --app`
- [ ] Install Phosphor: `pnpm add @phosphor-icons/react`
- [ ] Create Supabase project, run schema above
- [ ] Wire up Supabase client (`@supabase/ssr`)
- [ ] Set up Vercel project + env vars (Supabase URL/keys, API keys placeholders)
- [ ] Add Vercel cron config in `vercel.json`

**Deliverable:** Empty dashboard at localhost:3000 that can read/write to `engagement_event`.

---

## Phase 1 — Reddit Ingest (half day)

The easiest platform. Free API, clean data, no rate limit drama at personal scale.

- [ ] Register a Reddit app at reddit.com/prefs/apps (script type)
- [ ] Store refresh token in Supabase `secrets` table or Vercel env
- [ ] Create `/api/cron/reddit/route.ts`:
  - Fetch `/message/inbox` (unread mentions + replies)
  - Fetch comments on your last N posts via `/user/{username}/submitted`
  - Normalize into `engagement_event` shape
  - Upsert with `onConflict: 'platform,external_id'`
- [ ] Schedule cron every 15 min in `vercel.json`
- [ ] Manual test: trigger endpoint, confirm rows land in Supabase

**Deliverable:** Reddit notifications flowing into the database, deduped.

---

## Phase 2 — Minimal Dashboard UI (half day)

Ship something usable before adding more platforms.

- [ ] `/app/page.tsx` — Inbox view
  - List of events, newest first
  - Platform icon (Phosphor: `RedditLogo`, `YoutubeLogo`, `LinkedinLogo`, `XLogo`)
  - Author, content snippet, time ago, "View on platform →" deep link
  - Status pill (new / seen / replied / dismissed)
- [ ] Status actions — click to mark seen, replied, dismissed (optimistic UI)
- [ ] Filters — platform multi-select, status, "needs reply only" toggle
- [ ] Empty state + loading skeleton
- [ ] Mobile responsive (you'll check this from your phone)

**Deliverable:** A working dashboard for Reddit-only. Validate the UX before adding complexity.

---

## Phase 3 — YouTube Ingest (half day)

- [ ] Enable YouTube Data API v3 in Google Cloud Console
- [ ] OAuth flow OR API key (key works if monitoring your own channel)
- [ ] Create `/api/cron/youtube/route.ts`:
  - List your channel's recent videos
  - For each, fetch `commentThreads` (top-level comments)
  - For each thread, fetch replies if `totalReplyCount > 0`
  - Normalize and upsert
- [ ] Handle quota carefully — YouTube API has a 10k unit daily quota, `commentThreads.list` costs 1 unit per call
- [ ] Add to cron schedule (every 30 min is plenty)

**Deliverable:** YouTube comments on your videos appearing in the dashboard alongside Reddit.

---

## Phase 4 — LinkedIn via Email Parsing (1 day)

The pragmatic workaround for LinkedIn's locked API.

- [ ] Set up a dedicated inbox: `social-ingest@promad.design` (or similar)
- [ ] Configure LinkedIn email notifications: Settings → Communications → turn on individual emails for mentions, comments, reactions on your posts
- [ ] Set up auto-forward from your main inbox to `social-ingest@`
- [ ] **Option A — Cloudflare Email Workers:** Email arrives → worker parses → POSTs to your `/api/ingest/email` endpoint
- [ ] **Option B — Resend/Postmark inbound:** Configure inbound parse to webhook your Next.js endpoint
- [ ] Build `/api/ingest/email/route.ts`:
  - Identify sender pattern (LinkedIn vs X)
  - Pass email body to Gemini 2.5 Flash with a strict JSON schema prompt:
    ```
    Extract: type, author_handle, content, parent_content, source_url
    Return ONLY valid JSON matching this schema.
    ```
  - Validate, insert into `engagement_event`
- [ ] Test with 10-20 real LinkedIn notification emails, tune the prompt

**Deliverable:** LinkedIn engagement flowing in with ~95% accuracy. Manually handle the misses.

---

## Phase 5 — X via Email Parsing (half day)

Same mechanism as LinkedIn, different prompt.

- [ ] Configure X notification email settings: instant emails for mentions, replies, quotes only (skip likes/follows for v1)
- [ ] Forward to `social-ingest@`
- [ ] Extend email parser to detect X emails and use an X-specific Gemini prompt
- [ ] Test, tune

**Deliverable:** All four platforms ingesting.

**Optional alternative — Browser extension:** If email parsing for X feels brittle (their templates change often), a 1-day Chrome extension that scrapes notifications when you view x.com/notifications and POSTs to your endpoint is a clean fallback. You're viewing your own data, no ToS issue.

---

## Phase 6 — AI Priority Layer (half day)

Make the dashboard actually intelligent instead of just a feed.

- [ ] On every `engagement_event` insert, trigger a background job (Supabase Edge Function or Vercel queue)
- [ ] Call Gemini 2.5 Flash with the event + context:
  ```
  Score this engagement on three axes:
  1. needs_reply: bool — Does this contain a direct question to me, or a clear conversational opening?
  2. priority: low | medium | high
     - high: from notable account (follower count, verified, or in my network), 
             or question directed at me, or negative sentiment about my work
     - medium: substantive comment, thoughtful disagreement
     - low: emoji-only, generic praise, spam
  3. summary: 1-sentence summary if content > 200 chars
  ```
- [ ] Update the row with `needs_reply`, `ai_priority`, `ai_summary`
- [ ] Add "Needs attention" view to dashboard — filters to `priority = high` AND `status = new`

**Deliverable:** Dashboard now distinguishes "must reply" from "noise" automatically.

---

## Phase 7 — Daily Digest (half day)

The original ask: a morning digest.

- [ ] Create `/api/cron/digest/route.ts`, runs daily at 7:30am IST
- [ ] Query all `engagement_event` from last 24h
- [ ] Group by platform, count by priority
- [ ] Pass top 10 high-priority items to Gemini with prompt:
  ```
  Write a 5-bullet morning digest of yesterday's social engagement.
  Lead with anything that needs a reply.
  Group by theme, not platform.
  Tone: terse, scannable, no fluff.
  ```
- [ ] Send via Resend to your email (or post to a Slack channel — your call)
- [ ] Include direct deep link to the dashboard's "Needs attention" view

**Deliverable:** Daily 7:30am email summarizing yesterday + linking to anything urgent.

---

## Phase 8 — Trends & Polish (1 day)

- [ ] Trends view — engagement volume by platform over 7/30/90 days (Recharts)
- [ ] Top-performing posts — which of your posts drove the most engagement
- [ ] Response time stats — median time from event to `status = replied`
- [ ] Keyboard shortcuts — `j`/`k` to navigate, `e` to mark seen, `r` to mark replied, `d` to dismiss
- [ ] Snooze — push an event back to inbox in 24h
- [ ] Dark mode (you'll want it)

---

## Stack Summary

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) | Your default |
| Styling | Tailwind | Your preference |
| Icons | Phosphor | Your preference |
| Database | Supabase (Postgres) | You've used it across projects |
| Cron | Vercel Cron | Free tier covers this easily |
| AI | Gemini 2.5 Flash | Cheap, fast, you already use it |
| Email ingest | Cloudflare Email Workers or Resend Inbound | Both work; Cloudflare is free |
| Email send | Resend | Clean DX |
| Charts | Recharts | Standard, works with Tailwind |

---

## Timeline

**Realistic, working alongside other things:**

| Weekend | Outcome |
|---|---|
| Weekend 1 | Phases 0-3: Reddit + YouTube live, basic dashboard usable |
| Weekend 2 | Phases 4-5: LinkedIn + X via email parsing, all 4 platforms ingesting |
| Weekend 3 | Phases 6-7: AI priority + daily digest |
| Later | Phase 8 polish as you actually use it |

**Aggressive, focused sprint:** All of phases 0-7 in 4-5 focused days.

---

## Open Decisions

Before starting Phase 0, lock these:

1. **Email ingest provider** — Cloudflare Email Workers (free, more setup) vs Resend Inbound (paid, cleaner)?
2. **Digest delivery** — Email or Slack channel? (Slack is faster to skim from phone)
3. **Hosting** — Vercel (easy, but cron limits on hobby) or self-host on a VPS?
4. **Authentication** — Single-user (just you) means you can skip auth and gate by a single env-var token, or add Supabase Auth for cleanliness. Single-user + token is faster.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Email template changes break LinkedIn/X parsing | Gemini parsing is more resilient than regex; log parse failures to a "needs manual review" table |
| YouTube API quota exceeded | Cache aggressively, only poll videos from last 90 days |
| Reddit refresh token expires | Token refresh on 401; alert via digest email if refresh fails |
| Dashboard becomes another thing to check | Daily digest email is the primary surface; dashboard is for triage sessions, not constant monitoring |
| Scope creep into "reply from dashboard" | Hard rule: v1 is triage only. Re-evaluate after 30 days of real use |

---

## First Concrete Action

Start Phase 0 right now: spin up the Next.js project, create the Supabase project, run the schema. That's 30 minutes and unblocks everything else.
