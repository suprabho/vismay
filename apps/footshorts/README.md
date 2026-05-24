# Footshorts

InShorts-style football news app. Swipe 60-word AI-summarized cards, follow leagues/teams/players, get live match context inline.

## Stack

- **Mobile:** React Native (Expo SDK 52+), TypeScript, NativeWind (Tailwind), Phosphor icons, Reanimated 3
- **Web:** Next.js (App Router) + Tailwind — admin tools, onboarding, public story/league/team pages
- **Backend:** Supabase (Postgres + Auth + Realtime)
- **Ingestion worker:** Node/TS, run on GitHub Actions cron
- **AI:** Gemini 2.5 Flash for summarization + entity extraction
- **Stats:** football-data.org (fixtures, standings, scores)
- **News source:** RSS from 15–20 publishers (BBC, Guardian, ESPN FC, OneFootball, Goal, etc.)

## Monorepo layout

```
footshorts/
├── apps/
│   ├── mobile/          # Expo RN app
│   ├── web/             # Next.js app (admin + public pages + onboarding)
│   └── worker/          # RSS ingest, Gemini pipeline, fixtures + scores refresh
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
- `npm run worker:ingest` — pull RSS, summarize via Gemini, resolve entities, write articles

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
RSS feeds ─▶ worker (hourly via GH Actions) ─▶ Gemini ─▶ Supabase
                                                            │
football-data.org ─▶ scores worker (every 12h) ─────────────┤
                                                            ▼
                                  RN + web ◀── follow graph queries
```

## Phase status

- [x] Phase 0: Foundations
- [x] Phase 1: Ingestion pipeline (hourly cron, entity resolution, Gemini summaries)
- [x] Phase 2: Core app (auth, onboarding, feed, follow graph)
- [~] Phase 3: Live layer (fixtures, standings, scores refresh — in progress)
- [ ] Phase 4: Push notifications + retention

See `docs/plan.md` for detail.
