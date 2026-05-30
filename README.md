# Vismay

Monorepo for the Vismay viz engine and the apps it powers.

## Layout

### Apps

- `apps/vizmaya-fyi/` — the vizmaya.fyi app (geopolitics, economics, tech): scroll-synced maps, charts, and prose. Currently the only app with the full story layer (`fs|db` content via `@vismay/content-source`) and the offline render pipeline (PDF / video / audio / share-card).
- `apps/admin/` — the central admin console (vismay.xyz) for composing and managing content across apps and verticals; routes per app/epic (`vizmaya`, `coke-studio`, `energy-profile`, `epstein`, `fifa-wc26`, …). All AI generation routes through `@vismay/ai-gateway`.
- `apps/vizf1/` — VizF1: `web` + ingestion `worker` + `brand` tokens. Driver/team stories built from F1 race data.
- `apps/footshorts/` — Footshorts, an InShorts-style football news app: `web` + `mobile` + ingestion `worker`. Swipe AI-summarized cards, follow leagues/teams/players.
- `apps/catalog/` — `@vismay/catalog`: browses every registered `VizModule` across verticals with a live preview and its `adminForm` schema, for editors composing stories.

### Packages

- `packages/viz-engine/` — the viz engine: module registry, slot dispatchers, core viz modules, charts, and the capture pipeline. Imported by every consumer app. (Originally planned as a stub; the engine has since moved here out of `apps/vizmaya-fyi/`.)
- `packages/content-source/` — the `fs|db` story reader, story config types and resolver, and the render dispatch handlers (PDF / video / audio / share). Used by `apps/vizmaya-fyi/`.
- `packages/viz-admin/` — the admin form-schema renderer (`AdminFormFields`) for the Compose / catalog UIs.
- `packages/admin-core/` — shared admin UI primitives (login form, logout button, tabs).
- `packages/ai-gateway/` — one wrapper around the Vercel AI Gateway for all text + image generation. New AI features import from here, never from a provider SDK. See [`packages/ai-gateway/README.md`](packages/ai-gateway/README.md).
- `packages/eval-entities/` — end-to-end LLM-as-judge evaluation for entity tagging, shared across apps that ingest and tag articles.
- `packages/ui/` — stub. Will host shared branding (logo, theme provider).

### Verticals

- `verticals/{f1-viz,footshorts-viz,starship-viz}/` — per-vertical `VizModule` collections. Each module is a `Component` plus a co-located `sample` fixture and `adminForm` schema, registered into the engine and browsable via the `catalog` app.

## Working in the monorepo

```bash
pnpm install
pnpm --filter vizmaya-fyi dev
pnpm --filter vizmaya-fyi build
pnpm --filter vizmaya-fyi typecheck
pnpm --filter vizmaya-fyi lint
```

Swap `vizmaya-fyi` for any app name to target a different app. The workspace also nests app sub-packages (`apps/vizf1/*`, `apps/footshorts/*`) — see [`pnpm-workspace.yaml`](pnpm-workspace.yaml).

Per-app context (active initiatives, env vars, render wiring) lives in each app's `CLAUDE.md`, e.g. [`apps/vizmaya-fyi/CLAUDE.md`](apps/vizmaya-fyi/CLAUDE.md) and [`apps/admin/CLAUDE.md`](apps/admin/CLAUDE.md).
