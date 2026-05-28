# @vismay/starship-viz

3D SpaceX Starship viz module for Vizmaya stories. Ships one VizModule —
`starship:viewer` — registered into the engine when a story's frontmatter
declares `vertical: 'starship'`.

## Story integration

```yaml
# content/stories/my-starship-story.md frontmatter
---
title: 'Starship'
vertical: 'starship'
---

# content/stories/my-starship-story.config.yaml
sections:
  - id: hero
    foreground:
      - type: starship:viewer
        mode: rotate # rotate | explode | bellyflop | inspect
        material: metal # metal | black
        # Optional, only for explode/bellyflop:
        scrubSteps: 3 # activeStep / scrubSteps → 0..1 progress
```

## Modes

| Mode        | Behavior                                                                  |
| ----------- | ------------------------------------------------------------------------- |
| `rotate`    | Gentle Y-axis spin via `useFrame`. Studio HDRI. Showcase shot.            |
| `explode`   | Named parts (`cone`, `tank`, `raptor`) drift along ship-local Y by scrub. |
| `bellyflop` | Root group pitches 0°→70° on a back-ease curve, scrubable both ways.      |
| `inspect`   | `<OrbitControls>` + `<Bounds>` + drei `<Html>` part labels.               |

## Asset pipeline (one-time)

The runtime asset is a merged Draco-compressed `starship.glb` committed at
[public/models/starship.glb](public/models/starship.glb). Regenerating it
takes the original STL/3MF source files through `scripts/convert-starship-assets.ts`:

1. Stage the upstream files into `assets/source/` (gitignored):

   ```sh
   mkdir -p assets/source
   cp '~/path/to/starship/StarShip (SS)/'*.stl assets/source/
   cp '~/path/to/starship/StarShip (SS)/'*.3mf assets/source/
   ```

   The script only reads STL today — material variants are runtime PBR
   presets, not separate geometries. The 3MF files are kept for
   bookkeeping/future inspection.

2. Install deps (from repo root): `pnpm install`

3. Run the conversion (from this package): `pnpm convert-assets`

The script:

- Reads `ss_{cone,tank,raptor}_black_x1.stl`.
- Centers each part on its XZ midpoint, preserves Y.
- Groups under a `starship` parent, scales the assembly to ~3 units tall.
- Exports a single binary GLB via `three/examples/jsm/exporters/GLTFExporter`.
- Compresses meshes with Draco via `@gltf-transform/functions`.
- Writes `public/models/starship.glb` (~1.5–2 MB expected).

## Why one module, four modes?

All four moments share the same scene graph, GLB, and material setup. Splitting
into separate modules would force one GLB fetch per moment in any story that
shows the ship in multiple sections — and the `mode` is a story-config flag
the author already sets per section. The `stableIdentity` keys on
`(mode, material)` so consecutive sections that keep both the same reuse the
WebGL context instead of remounting.

## Native

`starship-viz` is web-only — WebGL through R3F. The `./native` export is a
placeholder so mobile builds don't break on resolution; stories that include
a `starship:viewer` layer should provide a poster image fallback for native.
