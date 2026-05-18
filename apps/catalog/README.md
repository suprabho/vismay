# @vismay/catalog

Browse every registered `VizModule` across core, F1, and Footshort verticals — each module is shown with a live preview rendered from a co-located `sample.ts` fixture plus its `adminForm` schema. Intended for admins / editors composing stories who want to see what each viz type looks like before adding one to a `.config.yaml`.

## Run

```bash
pnpm install
pnpm --filter @vismay/catalog dev
```

Open <http://localhost:3000>.

## Env vars

- `NEXT_PUBLIC_MAPBOX_TOKEN` — optional. Without it, the map module preview shows a fallback chip instead of rendering. Set it to your Mapbox public token to enable the live map preview.

## Auth (follow-up)

V1 ships open. Internal staging only. To gate, port the `isAuthed()` / `redirect('/admin/login')` pattern from `apps/vizmaya-fyi/lib/adminAuth.ts` into a new `apps/catalog/lib/auth.ts` and wrap `app/layout.tsx` in the check.

## How modules are enumerated

`app/layout.tsx` awaits both verticals' `register()` exports at server boot, then `lib/catalogModules.ts` joins the registry (`allRegisteredTypes()` from `@vismay/viz-engine`) against a hand-maintained list of `{ type, category, sample }` rows. Adding a new module means: (a) the module's vertical registers it, and (b) you add a row to `catalogModules.ts` pointing at a `sample.ts` next to the module.

## Module-side contract

Every module that wants a catalog entry exports a sibling `sample.ts`:

```ts
// packages/viz-engine/src/modules/image/sample.ts
import type { ImageLayerConfig } from './index'
export const sample: ImageLayerConfig = { type: 'image', src: '…', fit: 'cover' }
```

The catalog imports it explicitly via `lib/catalogModules.ts`, so non-catalog consumers (vizmaya-fyi, vizf1, footshort) tree-shake the sample data out of their bundles.
