# Footshorts share-card composer — testing guide

The composer has been rewritten from a single "card type" picker into a
**multi-layer composer**: a card is now an ordered stack of foreground layers
(`fscard:*` viz-engine modules) drawn inside a shared card frame, edited through
the reusable `LayerComposer` shell in `@vismay/viz-admin`.

This guide covers what to test, where, and the known limitations. All changes are
on branch `feat/shared-layer-composer`.

## Run

```bash
pnpm --filter admin dev          # → http://localhost:3001  (log in first)
```

**Composer:** http://localhost:3001/footshorts/share-cards

(Build/type gates already pass: `pnpm --filter admin typecheck` and
`pnpm --filter admin build` are green. **Never use `pnpm --filter admin lint`** —
it is red on `main` for unrelated reasons.)

## What it should look like

A **3-column** composer: **Layers** (left) · **live preview** (center) · **selected-layer
config** (right). Below the composer: **frame controls**, **background**, **publish
tags**, and **saved cards**. Top-right: **Download PNG / Save / Ship to product**.

---

## Core test scenarios

### 1. Single layer — every type renders + exports
For each type via **"+ Add layer"** (top of the Layers panel): **Match**, **Match
timeline**, **Fixtures**, **Standings**, **Form grid**, **News image**, **News
article**, **AI image**, **Badge / flag**.

- Select the layer → the right **config panel** shows its fields.
- Fill the picks (see §3) → the **preview** updates.
- **Download PNG** → the exported image matches the preview (crests not blank).

### 2. Multi-layer stack
- Add **Match** + **Standings** (same competition) → both **stack** in the preview
  (top half / bottom half).
- **Reorder** with ↑ / ↓; **hide/show** with ◉ / ○; **remove** with ✕.
- Hidden layers disappear from the preview; order in the list = top→bottom on the card.
- Download → the stacked card exports correctly.

### 3. Per-layer data pickers (right config panel)
- **Competition** picker → choose a competition. (Fixtures/standings then load.)
- **Match / Match timeline:** **Fixture** picker (depends on competition) + a **Style**
  select (Tile / Card·Horizontal / Portrait / Score); timeline adds an **Events** filter.
- **Fixtures:** **Fixtures** multi-select + **Density** (Compact/Expanded).
- **Standings:** **Group** picker (only for group-stage cups; says "league table" otherwise).
- **Form grid:** **Team** picker (depends on competition).
- **News image / article:** **Article** picker with search.
- Two layers can target **different competitions** — each loads its own data.

### 4. Badges / flags (overlay layer)
- Add a **Badge / flag** layer → config panel has a **Badge** picker (Crests tab =
  team/league search; Flags tab = country search) + **X / Y / Size** number fields.
- Pick a crest or flag → it floats over the card; adjust X/Y/Size (% of card) to move/resize.
- Badges render **on top** of the stack (and over the header/footer), and export.

### 5. News / AI captions
- **News image** layer → photo fills the body **with the publisher + headline** captioned
  over a bottom gradient (the caption now lives in the module).
- **AI image** layer → image + the caption text (from the layer's Caption field).

### 6. AI image generation
- Add an **AI image** layer → config panel has a **subject** box + **style** select +
  **Generate**. Generate → an image is produced and shown; **Regenerate** / **clear** work.
- A **Caption** text field sits below.

### 7. Frame controls (card-level, below the composer)
- **Theme**, **Format** (aspect ratio), **Accent** (hex), **Handle**, **Logo size/style**,
  **Eyebrow override** + **Show eyebrow** — each changes the card chrome live.

### 8. Background (behind the layer stack)
- **Aura slug** input → sets an aura background (preview only; not in the PNG — expected).
- **AI background:** describe + **Gen** → an AI image backdrop; **Scrim** slider dims it.
- **clear** removes it.

### 9. Save / load / delete
- **Save** → name it → it appears under **Saved cards**.
- **Load** a saved card → its layers + frame + background restore.
- **Delete** removes it.

### 10. ⭐ v1 → v2 migration (most important back-compat check)
- **Load an OLD saved card** (created before this refactor) from **Saved cards**.
- It should **migrate**: the old single card type becomes **one foreground layer**, old
  badges become **badge layers**, and it renders + re-exports. Re-saving writes the new
  `version: 2` shape (the DB column is opaque jsonb, so old rows load fine).

### 11. Ship to product
- **Publish tags** are auto-seeded from the layers (teams / leagues / news entities); add
  or remove tags via the search box + pills.
- **Ship to product** → renders the PNG and publishes with those tags.

---

## The four signals that matter most
1. Page **loads** (3-column composer, no crash / console errors).
2. You can build a **2-layer card** and it previews correctly.
3. **Download PNG** exports the stacked card (crests present, not blank).
4. **Existing saved cards still load** (v1→v2 migration).

## Known limitations (intentional, not bugs)
- **Aura backgrounds** never rasterize into the PNG (cross-origin iframe) — preview only.
- **Badge position** is set via X/Y/Size number fields, **not drag** yet.
- Stacked layers **split the card body equally** — no per-layer height/weight control yet.
- **Background** supports **aura + AI** only; the old **news-thumbnail** background is not
  restored (use a News-image *layer* instead).
- The old `ShareCardCanvas.tsx` is now **dead code** (to be deleted in cleanup); the live
  page uses the new `composer/` path.

## Regression check (the m0 shared-component move)
`VizConfigForm` was hoisted into `@vismay/viz-admin` (old path is a shim). These unrelated
surfaces use it and should be unchanged:
- **Story Assets tab:** `/vizmaya/<slug>` → Assets → "Compose viz" panel.
- **Canvas inspector:** `/vizmaya/<slug>/canvas` → select a layer → Content form.

## If something breaks
Report: the scenario number, the layer type, what happened (blank body, missing crests,
wrong layout, console error, failed save/ship), and whether it reproduces after a reload.
