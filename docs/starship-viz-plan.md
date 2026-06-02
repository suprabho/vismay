# StarShip (SS) Mini App — Build Plan

A plan for building an animated, interactive Starship 3D mini app and embedding it inline inside a Vizmaya story.

---

## Decisions locked in

| Area | Choice |
|---|---|
| Story moments | All four: exploded assembly, showcase rotation, belly flop, interactive inspector |
| Embed strategy | Inline React component (no iframe) |
| Code location | New package: `@vismay/starship-viz` |
| Asset pipeline | Convert STL/3MF → Draco-compressed glTF |

---

## The shape of it

A new workspace package `@vismay/starship-viz` at `packages/starship-viz/`, mirroring the existing `verticals/footshorts-viz` and `verticals/f1-viz` patterns. It exports a single React component `<StarshipBlock />`, which renders a Three.js scene via `@react-three/fiber` into a `<canvas>` element that lives inline inside the Vizmaya story page — no iframe, no extra route, no JS/style isolation overhead.

The story controls which of the four modes is active and (optionally) feeds a `0..1` `progress` value derived from scroll position, so the explode and belly-flop animations scrub naturally as the user scrolls.

---

## Stack choice

**React Three Fiber + drei on top of three.js.** This is the path of least resistance because:

- It's declarative, fits Next.js cleanly, and code-splits naturally.
- `drei` gives us `OrbitControls`, `Environment` (HDRI lighting), `useGLTF`, and `Html` (for inspector labels) out of the box.
- GSAP is already in `@vismay/viz-engine`, so we can reuse it for scrubbable animations across the four modes.

New dependencies added to the package: `three`, `@react-three/fiber`, `@react-three/drei`, plus type packages.

---

## Asset pipeline — the most important part

The five files in `StarShip (SS)/` total ~14 MB raw, dominated by `ss_raptor_black_x1.stl` (~10 MB). We do a **one-time offline conversion script** that:

1. Reads the five source files:
   - `ss_cone_black_x1.stl`
   - `ss_cone_metal_x1.3mf`
   - `ss_raptor_black_x1.stl`
   - `ss_tank_black_x1.stl`
   - `ss_tank_metal_x1.3mf`
2. Converts each to glTF (via `gltf-transform` CLI or a Node script using three.js loaders).
3. Applies Draco mesh compression (`gltf-transform draco`) — typically 80–90% size reduction on dense meshes like the Raptor cluster.
4. Optionally normalizes pivots so each part rotates/explodes around a sensible local origin.
5. Outputs to `packages/starship-viz/public/models/` — **preferably merged into a single `starship.glb` with named nodes** (one HTTP request, easier scene-graph management).

**Expected post-Draco footprint:** under 2 MB total.

At runtime we lazy-load the glb only when the story scrolls near the block (`next/dynamic` + `IntersectionObserver`), so the rest of the story stays fast.

---

## Component surface

```tsx
<StarshipBlock
  mode="rotate" | "explode" | "bellyflop" | "inspect"
  progress={0..1}              // optional scrub for explode/bellyflop
  material="metal" | "black"
  autoplay
  className="..."
/>
```

Internally one `<Canvas>` mounts a `<StarshipScene>` that loads the merged glb, groups its child meshes by name (`cone`, `tank`, `raptor`), and applies one of four animation behaviors.

### The four modes

- **rotate** — gentle Y-axis spin via `useFrame`, soft studio HDRI, ground shadow.
- **explode** — each child has a target offset along ship-local Y; `progress` lerps from 0 (assembled) to 1 (exploded). Labels appear via drei `<Html>` at the part's centroid.
- **bellyflop** — root `group` pitches from 0° to ~70° on a back-ease curve; `progress` scrubs it both ways.
- **inspect** — `<OrbitControls>` + drei `<Bounds>` + hover tints. The only mode that takes pointer input.

All four share the same scene graph and materials, so switching modes is just swapping which `useFrame` handler runs.

---

## Story integration

Looking at how `vizmaya-fyi` consumes `@vismay/footshorts-viz` and `@vismay/viz-engine`, the new package will match that pattern:

- Export from `src/web/index.ts`.
- Register in the story content schema as a new block type, e.g. `{ type: "starship", mode, material }`.
- Let the existing story renderer pick it up.

Controls (play/pause/reset, material toggle) use **Phosphor icons**; layout uses **Tailwind** (per project conventions).

---

## Story scrubbing

For the scroll-driven feel, `<StarshipBlock>` reads its own bounding rect with `useScroll`-style logic and maps in-viewport position to `progress`. This means `explode` and `bellyflop` "play" naturally as the user scrolls past, with no JS hooks needed from the parent story.

---

## Task breakdown

1. **Scaffold `@vismay/starship-viz` package** — `package.json`, `tsconfig`, `src/index.ts`, `src/web/index.ts`. Mirror `@vismay/footshorts-viz` layout. Wire workspace dep into `apps/vizmaya-fyi/package.json`.
2. **Build STL → Draco glTF asset pipeline** — `scripts/convert-starship-assets.ts` converts the 5 SS files into `.glb` under `packages/starship-viz/public/models/`. Document the one-time run in the package README.
3. **Add Three.js + R3F dependencies** — `three`, `@react-three/fiber`, `@react-three/drei`, types. Confirm React 19 / Next 16 peer compatibility.
4. **Implement core `StarshipScene` component** — Canvas, HDRI lighting, single glb loader, named-mesh extraction, metal/black material variants.
5. **Implement the 4 animation modes** — `rotate`, `explode`, `bellyflop`, `inspect`. All driven by a `progress` prop so the story can scrub via scroll.
6. **Add story integration adapter** — `<StarshipBlock>` consumes story scroll/step state, Phosphor-icon controls, Tailwind layout.
7. **Wire into vizmaya-fyi + demo page** — add workspace dep, create `app/(demo)/starship/page.tsx` showcasing all 4 modes, register the story block type.
8. **Verify** — `pnpm typecheck && pnpm build`, screenshot each mode, check Next.js bundle output to confirm Draco worked, sanity-test mobile at 380px.

---

## Open question before coding starts

**Merge or split the glb?**

- **Merged `starship.glb` with named nodes** (recommended) — one fetch, easier scene-graph management, standard pattern for product-viewer scenes.
- **Separate `.glb` per part** — 5 HTTP requests, but easier to reposition parts independently after the fact.

Leaning merged. Open to splitting if independent pivots end up being a recurring need.

---

## Expected file layout

```
packages/starship-viz/
├── package.json
├── tsconfig.json
├── README.md
├── public/
│   └── models/
│       └── starship.glb           # Draco-compressed, ~2 MB
├── scripts/
│   └── convert-starship-assets.ts # one-time pipeline
└── src/
    ├── index.ts                   # re-exports
    └── web/
        ├── index.ts
        ├── StarshipBlock.tsx      # story-facing wrapper
        ├── StarshipScene.tsx      # R3F Canvas + scene
        ├── modes/
        │   ├── rotate.ts
        │   ├── explode.ts
        │   ├── bellyflop.ts
        │   └── inspect.ts
        └── materials.ts           # metal/black presets

apps/vizmaya-fyi/
└── app/
    └── (demo)/
        └── starship/
            └── page.tsx           # showcase route
```
