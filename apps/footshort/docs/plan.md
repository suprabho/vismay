# ShortFoot — Execution Plan

## Decisions locked

| Decision | Choice |
|---|---|
| Mobile framework | React Native + Expo SDK 52+ |
| Platform | Android-first (iOS later) |
| Auth | Email + OAuth (Google, Apple) |
| Backend | Supabase (Postgres + Auth + Edge Functions) |
| Summarization | Gemini 2.5 Flash |
| Stats API | football-data.org (MVP) → api-football (growth) |
| News source | RSS from 10+ publishers (commercially sound) |
| Monetization | Deferred — revisit post-launch |

## Environment variables (create `.env` files)

### `apps/worker/.env`
```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...          # service_role key, server-only
GEMINI_API_KEY=...                    # Google AI Studio → API keys
GEMINI_MODEL=gemini-2.5-flash         # optional override
FOOTBALL_DATA_TOKEN=...               # football-data.org dashboard
```

### `apps/mobile/.env`
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...  # anon key, safe to ship
```

## Setup steps (run in order)

### 1. Supabase project
- Create project at supabase.com
- Go to SQL editor, paste `supabase/migrations/20260420000000_init.sql`, run
- Settings → API: grab `url`, `anon` key, `service_role` key
- Auth → Providers: enable Email, Google, Apple
  - Google: configure OAuth client in Google Cloud Console, add `https://xxxxx.supabase.co/auth/v1/callback` as redirect
  - Apple: requires paid Apple Developer account ($99/yr) — skip for Android-first

### 2. Get API keys
- **Gemini:** aistudio.google.com → Get API key (free tier, no card required)
- **football-data.org:** register at football-data.org/client/register
  - Free tier: 12 competitions, 10 req/min, **personal/educational only**
  - For commercial launch: upgrade to Standard (€29–49/mo)

### 3. Seed entities
```bash
cd apps/worker
npm install
npm run seed
```
This pulls leagues + teams from football-data.org into your `entities` table. Takes ~2 min due to rate limiting.

### 4. First ingestion run
```bash
npm run ingest
```
Expect ~100–200 articles on the first run from the default RSS sources. Watch the logs for `[entity-miss]` — those are entities Gemini found that aren't in your canonical list. Add aliases in `entityResolver.ts` or manually add to `entities` table.

### 5. Schedule ingestion
Options (pick one):
- **Supabase Edge Function + pg_cron** (simplest, stays in Supabase)
- **Fly.io worker with a cron schedule** (more control, separate from Supabase)
- **GitHub Actions scheduled workflow** (free, but slow cold starts)

Recommend running every 10 min. At 15 sources × ~20 items avg = 300 feed items per run, ~50 new articles/day typical.

### 6. Mobile app
```bash
cd apps/mobile
npm install
npx expo start --android
```

## Phase 1 — Ingestion pipeline (now)

**What's built:**
- RSS fetcher with dedupe
- Gemini summarization with structured output
- Entity resolver with alias support
- Seeding script for canonical entities

**Next work:**
- [ ] Clustering pass: group near-duplicate stories (same transfer news from 5 outlets)
  - Approach: embed headlines with Gemini text-embedding-004, cosine similarity > 0.85, pick cluster lead by publisher tier + recency
- [ ] Backfill player entities (phase 2, requires paid football-data or api-football squad endpoint)
- [ ] Failure alerts (email/Discord webhook when ingestion fails for N consecutive runs)
- [ ] Ingestion metrics dashboard (Supabase Studio view over `articles` grouped by status/day)

## Phase 2 — Core app (weeks 3–4)

**Screens:**
- `/login` — email + Google OAuth via Supabase
- `/onboarding` — pick 3+ leagues → 3+ teams → optional players
- `/(tabs)/feed` — vertical card swiper (follows feed)
- `/(tabs)/discover` — cluster leads from last 24h
- `/(tabs)/following` — manage entities
- `/(tabs)/profile` — settings, sign out
- `/article/[id]` — full card view with "Read at source" link + related stories

**Components to build (design with frontend-design skill):**
- `FeedCard` — headline, summary, publisher chip, image
- `SwiperContainer` — Reanimated vertical pan, snap to next card
- `EntityChip` — small pill with crest + name, tappable
- `MatchWidget` — inline fixture card when article ties to an upcoming/live match
- `FollowToggle` — star icon, optimistic updates

## Phase 3 — Live layer (week 5)

- Integrate football-data.org fixtures endpoint
- `MatchWidget` inside cards shows kickoff time + final score for finished fixtures (live scores deferred to Phase 5)
- Past-match recap: pull finished-fixture stats (lineups, goals, cards, xG where available) → Gemini summary into a short narrative. Cache one recap per fixture in `match_recaps` to keep token cost bounded.
- `/league/[slug]` standings screen
- `/team/[slug]` team page (next match + recent news + last 5 recaps)
- `/player/[slug]` player page (team + recent news)

## Phase 4 — Retention (week 6+)

- Expo Notifications for breaking news on followed entities
- Daily digest push at user's chosen time
- "Top stories today" curated list (manual curation or score-based: engagement + recency)
- **User analytics** — per-user Profile tab stats: articles read this week, top teams by reads, most-read league, reading streak. Requires a `reads` events table (log card impression/open to source) before this is meaningful.
- **Today view — topic digest stacks:** for each followed topic (league/team/player), a 5–6 card stack summarizing the day. Requires the Phase 1 clustering pass to exist; one Gemini call per cluster → digest card. Shown as a dismissable daily surface on the feed tab.
- Deferred: monetization decision (ads vs freemium)

## Phase 5 — Intelligence & interaction (post-launch)

Gated behind real usage data — don't build until Phases 2–4 have users.

- **Live scores:** integrate real-time fixture state into `MatchWidget`. Poll football-data every ~60s while a followed fixture is live; back off to 10 min otherwise. Revisit api-football's push stream if polling hits rate caps.
- **Ask-anything chat:** single input on the home tab that routes questions across three backends:
  1. Structured football data (stats, fixtures, standings) — deterministic SQL/function calls.
  2. User's own feed corpus (semantic search over ingested articles via the same embeddings Phase 1 produces).
  3. Open Gemini call for general football Q&A as the fallback.
  Router is a small tool-calling prompt that picks (1)/(2)/(3) per turn.
- **Generative UI responses:** instead of plain chat bubbles, render structured tool outputs as real components — fixture cards, standings tables, player comparison widgets, mini article stacks. Prototype with a constrained JSON schema ("ui blocks") before pulling in a full OpenUI-style runtime.
- **Cost/latency guardrails:** per-user daily token caps, aggressive caching of identical questions, and a "fixed corpus" eval harness so we can measure answer quality before scaling spend.
- **Feedback loop:** dislikes + chat follow-ups feed the same personalization signal used by swipe-left, so the ranker keeps improving.

## Backlog (unscheduled)

Ideas captured but not on any phase. Pull into a phase when there's a reason to.

- **Swipe-driven personalization:** wire up the swipe gestures from Phase 2's `SwiperContainer`.
  - Left = not interested → write to `article_dislikes (user_id, article_id)` + downrank the article's entities in the ranker.
  - Right = show more → query nearest neighbors from the headline embeddings (shared with clustering), insert the top related card after the current one.
  - Depends on: Phase 1 clustering/embeddings, and a ranker worth feeding (likely post-Phase 4).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| RSS feed changes / breaks | Per-source error alerting; maintain 10+ sources so one failure ≠ empty feed |
| Gemini rate limits at scale | Flash has generous limits; batch requests if needed; queue via Supabase |
| Entity misses (Gemini returns "Xavi" for both the player and the coach) | Context-aware resolver: use article body + league context to disambiguate |
| Commercial terms on RSS | RSS is explicitly syndication-friendly; always link back to source; never reproduce full text |
| football-data free-tier commercial ban | Upgrade to paid before launch — budget €29–49/mo |
| Push notification spam | User-configured frequency caps; respect quiet hours |

## Open items to revisit

- **App name** — "ShortFoot" is a placeholder
- **Branding** — Promad could do the visual identity (your lane)
- **Monetization** — decide before scaling marketing spend
- **iOS launch** — requires $99/yr Apple Developer; deferred per your call
