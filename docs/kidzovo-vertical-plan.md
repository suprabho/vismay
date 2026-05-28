# Kidzovo vertical — implementation plan

A new `@vismay/kidzovo-viz` vertical that turns kids' stories into scrollytelling panels. Inspired by Figma: `Kidzovo-Stories`, frame `92:143` — _"Ovi's Messy Room"_ (9 panels).

## 1. Goal

Each story is a sequence of illustrated **panels**. A panel composes:

- A full-bleed **background image** (room, kitchen, park, …)
- A **scene caption** at the top (third-person narration)
- One or more **characters** rendered as Rive animations (owl, mama, dad, …)
- One or more **speech bubbles** rendered as Rive animations, optionally tail-pointed at a character

Readers progress vertically — one panel per scroll-snap unit — using vismay's existing scrollytelling engine. No new scroll infra; we ride on `ScrollySectionBlock` + `ForegroundLayoutSlot`'s `activeStep`.

## 2. Architectural decisions (locked in with you)

| Decision | Choice | Why |
|---|---|---|
| Scene composition | **Hybrid** — `kz:character` and `kz:bubble` are first-class modules; background uses core `image`, caption uses core `text` | Reuses engine atoms for the boring parts (image/text already handle theming, capture, mobile); domain-specific knobs (pose, bubble tail, speaker anchoring) live in their own modules |
| Reader progression | **Vertical scrollytelling** via existing `scrolly-section` | Zero new infra; `activeStep` already threads to every foreground layer; works on desktop + mobile |
| Package name | `@vismay/kidzovo-viz` at `verticals/kidzovo-viz/` | Matches `footshorts-viz` / `f1-viz` exactly |
| First deliverable | **Plan only** (this doc) | No code yet — review the plan, then we scaffold |

## 3. File tree

```
verticals/kidzovo-viz/
├── package.json                      # mirrors footshorts-viz: workspace dep on @vismay/viz-engine
├── tsconfig.json
└── src/
    ├── index.ts                      # exports register(); dynamic-imports each module
    ├── types.ts                      # CharacterPose, BubbleTone, BubbleAnchor, …
    ├── data/
    │   ├── characters.ts             # palette: { ovi, mama, dad } → { riv asset key, default pose, palette tokens }
    │   └── stories.ts                # optional: registry of story slugs → asset bundles (later)
    ├── layouts/
    │   └── kz-storybook.ts           # ForegroundLayoutDef — caption top, stage middle, bubble lane upper-right
    ├── modules/
    │   ├── character/
    │   │   ├── index.ts              # VizModule<KzCharacterConfig> + parseConfig + adminForm
    │   │   ├── Component.tsx         # Wraps the core rive module's Component, applies pose-by-step
    │   │   └── sample.ts             # Authoring sample: Ovi standing → arms-up
    │   └── bubble/
    │       ├── index.ts              # VizModule<KzBubbleConfig>
    │       ├── Component.tsx         # Rive bubble + auto-anchored tail; uses theme tokens for fill/stroke
    │       └── sample.ts
    ├── web/
    │   └── index.ts                  # (later) presentational components reused by Kidzovo's own marketing site
    └── native/
        └── index.ts                  # (later) Expo bindings; stub on day one
```

The two new modules are deliberately thin wrappers around the engine's existing `rive` module — they don't reinvent rive playback, they just add domain semantics on top (named poses, named tail anchors, brand palette).

## 4. Story YAML — what authors write

```yaml
---
title: "Ovi's Messy Room"
subtitle: "A story about caring for your things"
byline: "Kidzovo"
date: "2026-06-01"
status: "draft"
vertical: "kidzovo"
theme:
  colors:
    background: "#fff7ec"
    text: "#3d2a17"
    accent: "#ff7aa9"     # bubble pink
    accent2: "#65d0d0"    # owl teal
    surface: "#ffffff"
    muted: "#9a7d65"
    line: "#f2c8b6"
  fonts:
    serif: "Fraunces"
    sans: "Nunito"
    mono: "JetBrains Mono"
---

# Ovi's Messy Room

## Cover

::: scrolly
steps:
  - label: "Title"
    content: "Ovi loved to play in her room all day long."
  - label: "Whoosh"
    content: "She threw toys, crayons, socks, and clothes everywhere while playing."
  - label: "Mama enters"
    content: "Mama carefully stepped around the messy floor."
  # … one step per panel
:::

foreground:
  layout: kz-storybook
  regions:
    background:
      - type: image
        src: "assets://kz/ovi-room-bg"
        style: { size: { width: "100vw", height: "100vh" } }
    caption:
      - type: text
        content: ${step.content}        # threaded from ScrollStep
    stage:
      - type: kz:character
        who: ovi
        pose:
          stepwise: [standing, throwing, sitting, …]   # one per step
        anchor: { x: center, y: bottom }
      - type: kz:character
        who: mama
        visibleFrom: 2                  # mounts but hidden until step 2
        pose:
          stepwise: [_, _, walking, scolding, _, _, _, _, _]
        anchor: { x: 0.7, y: bottom }
    bubbles:
      - type: kz:bubble
        visibleOn: [2, 3]
        speaker: mama
        tone: gentle
        textStepwise:
          - "Ovi! Someone can get hurt or lose things."
          - "Taking care of our things shows we are thankful for them."
```

The `${step.content}` reference is the existing engine convention for per-step text — we don't invent new templating. `visibleFrom`, `visibleOn`, and `*.stepwise` are the new authoring vocabulary; they all compile down to the rive module's existing `stepInput.stepwise` + opacity/visibility writes.

## 5. New modules — specifications

### 5.1 `kz:character`

A Rive-backed character that knows about pose changes per scroll step.

```ts
export interface KzCharacterConfig {
  type: 'kz:character'
  /** Lookup key into data/characters.ts (e.g. 'ovi', 'mama', 'dad'). */
  who: string
  /** Override the bundled .riv ('assets://...' or absolute URL). */
  src?: string
  /** Override the artboard / state machine. */
  artboard?: string
  stateMachine?: string
  /** Per-step pose. Resolves to the character's pose enum in characters.ts. */
  pose?: { stepwise: (string | null)[] } | { static: string }
  /** Which step the character first appears on. Below this step → opacity 0. */
  visibleFrom?: number
  /** Anchor on the stage region (0..1 fractions OR 'left|center|right' / 'top|center|bottom'). */
  anchor?: { x: number | 'left' | 'center' | 'right'; y: number | 'top' | 'center' | 'bottom' }
  /** Optional view-model color/number bindings (forwarded to the core rive module). */
  bindings?: Record<string, string | number | boolean>
}
```

Implementation: `Component.tsx` resolves `who` against `data/characters.ts`, fills in `src`/`artboard`/`stateMachine` defaults, maps `pose.stepwise` to a `stepInput` on the rive state machine input named `pose` (or whatever each .riv conventions to), and renders the engine's existing rive Component with the merged config. `visibleFrom` becomes a CSS opacity transition on the wrapper, not a Rive concern — keeps the .riv file simple.

`adminForm` returns: `who` (select from palette), `pose.stepwise` (json), `visibleFrom` (number), `anchor` (two enums), `src` (asset override, optional).

### 5.2 `kz:bubble`

A Rive-backed speech bubble. Knows about a speaker (for tail direction) and per-step text.

```ts
export interface KzBubbleConfig {
  type: 'kz:bubble'
  /** Optional .riv override. Defaults to bundled bubble.riv with pink/blue/yellow variants. */
  src?: string
  /** Which steps the bubble is shown on. Same length convention as ScrollStep[]. */
  visibleOn?: number[]
  /** Whom the tail points at — resolved at runtime against on-stage characters. */
  speaker?: string
  /** Visual register. Maps to bubble.riv state-machine inputs (e.g. corner radius, color). */
  tone?: 'gentle' | 'loud' | 'whisper' | 'thought'
  /** Per-step body text. Length should match ScrollStep[]; nulls hide on that step. */
  textStepwise: (string | null)[]
  /** Manual placement override. When omitted, layout is auto from `speaker`. */
  position?: { x: string; y: string }
}
```

Implementation: text is drawn as an HTML overlay positioned on top of the rive bubble (so wrap/length behaves), not painted inside the .riv. The .riv handles: pop-in animation, tail angle (driven by a `tailAngle` state-machine number input computed from the speaker's anchor), and color/tone. This keeps `.riv` files reusable across stories — the .riv never has to bake in text.

`adminForm`: `tone` (select), `speaker` (select from on-stage characters), `textStepwise` (json), `visibleOn` (json), `position` (optional manual override).

## 6. New foreground layout — `kz-storybook`

Registered from the vertical's `register()` via `registerForegroundLayout(…)`. Layout regions:

| Region | Style (landscape) | Style (portrait) | Accepts |
|---|---|---|---|
| `background` | inset 0 (full-bleed) | inset 0 | `image`, `video` |
| `caption` | top 4vh, centered, max-width 720px | top 3vh, full-width with 5vw padding | `text` |
| `stage` | absolute, inset 0, padding-bottom 12vh | absolute, inset 0, padding-bottom 22vh | `kz:character` |
| `bubbles` | absolute, inset 0 (overlays stage) | absolute, inset 0 | `kz:bubble` |

Why split `stage` and `bubbles` into two regions even though both fill the viewport? Z-stacking and pointer-events: bubbles always sit above characters, and the bubble region is the only one that ever wants `pointer-events: auto` (for "next page" affordances on mobile).

Portrait variant just tightens the bottom padding so bubbles don't get clipped under mobile chrome.

## 7. Asset strategy

Assets are referenced via the existing `assets://<key>` convention used by `image` and `rive` modules. Two tiers:

1. **Story-local** — per-story uploads (`assets://kz/ovi-room-bg`, `assets://kz/ovi-story-1/bubble-1`). Authors upload via the admin asset uploader; the introspector tool resolves to a signed URL at SSG time. This is the day-1 path.
2. **Vertical-bundled** — a small palette of reusable characters (`assets://kz/characters/ovi.riv`) and bubble templates (`assets://kz/bubbles/default.riv`) that ship as workspace-bundled files. Looked up via `data/characters.ts`. This is the polished path once we have ≥3 stories and have settled on canonical .riv contracts.

For the **walking-skeleton** we keep it all story-local: every story uploads its own background image + character + bubble .riv files; `data/characters.ts` ships with one entry (`ovi`) so author tools have something to seed from.

## 8. Engine integration — wiring steps

These changes touch the engine + the host app, not just the new vertical:

1. **Register the vertical loader** in `apps/vizmaya-fyi/components/VerticalLoader.tsx`:
   ```ts
   registerVerticalLoader('kidzovo', () =>
     import('@vismay/kidzovo-viz').then((m) => m.register())
   )
   ```
2. **Add the new package** to `pnpm-workspace.yaml` (already covered by the `verticals/*` glob if present — verify), and to `apps/vizmaya-fyi/package.json` as a workspace dep so the dynamic import resolves.
3. **No engine core changes required** — the core engine already exposes `registerVizModule`, `registerForegroundLayout`, `registerVerticalLoader`, and the rive module's `stepInput` covers per-step state-machine writes. The vertical is a pure plugin.
4. **(Optional) Engine helper** — if `kz:character` and `kz:bubble` end up sharing a "fade in on `visibleFrom`" wrapper, lift it into `packages/viz-engine/src/lib/` as `useStepVisibility(activeStep, visibleFrom?, visibleOn?)`. Don't pre-build this; extract only when both modules want the same hook.

## 9. Implementation phases

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Scaffold** | `verticals/kidzovo-viz/` package skeleton, empty `register()`, wired into `VerticalLoader.tsx`. A demo story with `vertical: kidzovo` loads without errors and the dev console logs "kidzovo registered." | Build passes; `pnpm -F @vismay/vizmaya-fyi build` succeeds; demo story 404-free. |
| **1 — Layout + caption** | `kz-storybook` layout registered. Demo story shows a scrollable sequence of N steps where the background image swaps per step and the caption updates from `${step.content}`. No characters yet. | Manual: scroll through 3 panels, see different bg + caption per panel. |
| **2 — `kz:character`** | Module shipped end-to-end with one bundled character (Ovi). Pose-by-step works via rive `stepInput.stepwise`. `visibleFrom` fades in. | Manual: Ovi appears on step 1, changes pose at step 3. Lighthouse: no CLS introduced. |
| **3 — `kz:bubble`** | Module shipped with `gentle` and `loud` tones. Auto-anchored tail from `speaker`. `textStepwise` overlay. | Manual: bubble pops on step 2, tail points at Mama, text changes by step. |
| **4 — Ovi's Messy Room** | Author the full 9-panel story (`content/stories/ovi-messy-room.md`) as the proof. Two characters, three bubbles, full art. | The story renders end-to-end on desktop + mobile (375px) and looks like the Figma. |
| **5 — Polish** | Capture mode for PDF/share cards (extend `capture.mode` choice per panel — likely `posterImage` for kid stories). Admin forms for both modules. Accessibility pass (alt text for bgs, `aria-live` on caption). | Share card renders; admin can edit a panel without leaving the UI; axe-core clean. |

## 10. Open questions to settle before phase 0

- **Story length & shape.** Are all Kidzovo stories ~9 panels with the same regions, or do later stories need title cards / interstitials / quiz pages? If yes, plan a second layout (`kz-title`, `kz-quiz`) or accept that `kz-storybook` covers 80%.
- **Character library.** Day-1 palette: just `ovi`, or `ovi + mama + dad` (i.e. all three from the Messy Room story)? Affects how much .riv work we need before phase 4.
- **Bubble text inside or outside the .riv?** Plan above puts text as HTML overlay. The alternative — text baked into the .riv via runtime text runs — is more polished animation-wise but harder to localize and breaks copy-edit-without-redeploy. Recommended: HTML overlay.
- **Localization.** Bubbles and captions are user-facing copy. If Kidzovo ships multilingual, we want translation keys, not literal strings, in `textStepwise`. Easier to bake in now than retrofit.
- **Audio narration.** Storybooks usually want a "play" affordance. Not in scope for phase 0–4, but worth marking the design space (one audio file per step? continuous narration with timestamp markers?).
- **Pencil / Figma source-of-truth.** Are characters authored in Rive directly, or in Pencil/Figma → exported to Rive? Affects asset pipeline.
- **Standalone app vs. embedded in vizmaya.fyi.** The plan above embeds Kidzovo stories inside the existing vizmaya.fyi host. If Kidzovo gets its own domain/app, we'll add a second consumer of the package (e.g. `apps/kidzovo/`) that calls `register()` itself.

## 11. Verification plan

Per phase the exit criteria above are manual checks. Beyond those:

- **Unit tests** for `parseConfig` on both modules — same pattern as `footshorts-viz/src/modules/match-card/index.ts` already uses (invalid `who`, missing `textStepwise`, etc.).
- **Engine integration test**: load `kidzovo` via `loadVertical('kidzovo')` from a Jest test and assert `getVizModule('kz:character')` and `getVizModule('kz:bubble')` resolve.
- **Visual regression**: per-panel screenshots via the existing capture pipeline (`mode: 'capture'`). Diff against checked-in baselines.
- **Mobile sanity**: portrait variant of `kz-storybook` at 375px wide — bubbles don't clip, characters don't fight the caption for space, scroll-snap behaves.

## 12. Risk register

| Risk | Mitigation |
|---|---|
| .riv files balloon the bundle | Lazy-load via `assets://`; never import .riv statically. The engine's rive module already streams. |
| Author can't see what they're editing | Phase 5 admin form. Until then, dev-only inline panel with the parsed config (mirrors what footshorts does). |
| Children's content has higher accessibility bar than data-journalism | Phase 5 explicitly includes a11y pass; bubbles should also offer a captions-on-everything mode. |
| Scroll-snap on a long story is fatiguing on mobile | Test phase 4 with real users (kids + parents). If snap-scroll fails, fall back to swipe + dots — same module set, just a different host shell. The modules don't care how `activeStep` is incremented. |

---

**Next step:** review this plan, confirm the open questions in §10 (especially the character library scope), then I scaffold phase 0.
