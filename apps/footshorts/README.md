# Footshorts

InShorts-style football news app. Swipe 60-word AI-summarized cards, follow leagues/teams/players, get live match context inline.

## Stack

- **Mobile:** React Native (Expo SDK 52+), TypeScript, NativeWind (Tailwind), Phosphor icons, Reanimated 3
- **Web:** Next.js (App Router) + Tailwind — admin tools, onboarding, public story/league/team pages
- **Backend:** Supabase (Postgres + Auth + Realtime)
- **Ingestion worker:** Node/TS, run on GitHub Actions cron
- **AI:** Vercel AI Gateway — Jev decides what's football and which tags are real subjects; Claude Haiku 5.5 summarises + extracts entities
- **Stats:** football-data.org (fixtures, standings, scores)
- **Analytics:** Amplitude on web + mobile. One shared event taxonomy in `packages/shared/src/analytics.ts`; per-app SDK wrappers in `web/lib/analytics.ts` (Browser SDK, autocaptured page views) and `mobile/src/lib/analytics.ts` (React Native SDK, explicit `screen_viewed`). No-ops without `NEXT_PUBLIC_AMPLITUDE_API_KEY` / `EXPO_PUBLIC_AMPLITUDE_API_KEY`.
- **News source:** RSS from 15–20 publishers (BBC, Guardian, ESPN FC, OneFootball, Goal, etc.)

## Monorepo layout

```
footshorts/
├── apps/
│   ├── mobile/          # Expo RN app
│   ├── web/             # Next.js app (admin + public pages + onboarding)
│   └── worker/          # RSS ingest, AI pipeline (Jev + Claude), fixtures + scores refresh
├── packages/
│   ├── shared/          # Shared types, zod schemas, Supabase client
│   └── brand/           # Shared brand tokens (colors, logos)
├── supabase/
│   └── migrations/      # SQL schema
├── .github/workflows/   # ingest.yml (hourly), scores.yml (every 12h)
└── docs/                # Architecture notes, phase plans
```

## Worker scripts

Run from repo root:

- `npm run worker:seed` — seed competitions/teams/players
- `npm run worker:ingest` — pull RSS, classify via Jev, summarize via Claude Haiku, resolve + gate entities, write articles

Worker also includes `scores.ts` (live + recent results refresh), `fixtures.ts` (upcoming fixtures + standings), `entityResolver.ts`, and `backfillColors.ts` / `backfillImages.ts` one-shots.

## Web / mobile dev

- `npm run web:dev` — Next.js dev server
- `npm run web:build` — production build
- `npm run mobile:start` — Expo dev server
- `npm run mobile:android` — Android dev build
- `npm run mobile:release` — release build
- `npm run typecheck` — typecheck all workspaces

## Data flow

```
RSS feeds ─▶ worker (hourly via GH Actions) ─▶ Jev + Claude ─▶ Supabase
                                                                  │
football-data.org ─▶ scores worker (every 12h) ───────────────────┤
                                                                  ▼
                                        RN + web ◀── follow graph queries
```

## HTML stories (`footshorts.com/s/<slug>`)

Agent-authored pages, hosted as written: any agent (Claude, ChatGPT, Cursor, …)
reads the brief, writes one self-contained HTML file and posts it; the web app
serves it under a CSP sandbox wrapped only in the Footshorts header and footer,
and lists it on the feed's **Editorial** tab beside the viz-engine stories.
Shared machinery in [`packages/html-stories`](../../packages/html-stories)
(rows in the shared `html_stories` table with `app_slug = 'footshorts'`); full
notes in [`apps/vizmaya-fyi/CLAUDE.md`](../vizmaya-fyi/CLAUDE.md#html-stories-sslug--agent-authored-pages).

- **Brief:** `GET /api/html-stories/brief` — the footshorts house style
  (classic theme, Forum / Space Grotesk / Space Mono), chrome and posting
  rules. `?style=random` borrows a palette and fonts from an editorial story.
  `?fixtures=<id>,<id>&prompt=…` (with the publish token as a bearer) appends
  the **match context** for up to forty matches: Opta facts and the full stat
  set, the timeline, Opta's insights and commentary, the build-up, each side's
  form and schedule, the league table and the competition's next fixtures.
  Admin's `/footshorts/html-stories` tab builds the same brief from a match
  picker ("Copy agent brief").
- **Publish:** `POST /api/html-stories?slug=…&publish=1` with the HTML body and
  `Authorization: Bearer $HTML_STORIES_TOKEN`; or the MCP `publish_html_story`
  tool with `app: "footshorts"`; or paste into the admin tab.
- **Env (web):** `SUPABASE_SERVICE_ROLE_KEY` (the table is RLS-locked to the
  service role) and `HTML_STORIES_TOKEN` (any long random string). Optional:
  `HTML_STORIES_MAPBOX_TOKEN` (a public `pk.` token for story maps; falls back
  to `NEXT_PUBLIC_MAPBOX_TOKEN`), injected into served stories that use Mapbox.

## Phase status

- [x] Phase 0: Foundations
- [x] Phase 1: Ingestion pipeline (hourly cron, entity resolution, Gemini summaries)
- [x] Phase 2: Core app (auth, onboarding, feed, follow graph)
- [~] Phase 3: Live layer (fixtures, standings, scores refresh — in progress)
- [ ] Phase 4: Push notifications + retention

See `docs/plan.md` for detail.
