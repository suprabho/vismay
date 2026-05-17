# Vismay

Monorepo for the Vismay viz engine and the apps it powers.

## Layout

- `apps/vizmaya-fyi/` — the vizmaya.fyi app (geopolitics, economics, tech). Imports the engine in-place for now; a Phase B PR will move the engine into `packages/viz-engine/`.
- `packages/viz-engine/` — stub. Will host the registry, slot dispatchers, core viz modules, asset pipeline, and capture pipeline.
- `packages/viz-admin/` — stub. Will host the asset uploader, Compose panel, and admin form schema renderer.
- `packages/content-source/` — stub. Will host the `fs|db` story reader, story config types, and resolver.
- `packages/ui/` — stub. Will host shared branding (logo, theme provider).

## Working in the monorepo

```bash
pnpm install
pnpm --filter vizmaya-fyi dev
pnpm --filter vizmaya-fyi build
pnpm --filter vizmaya-fyi typecheck
pnpm --filter vizmaya-fyi lint
```

The reference plan that drove the initial structure lives at `apps/vizmaya-fyi/CLAUDE.md` plus the original engine doc shared by the project owner.
