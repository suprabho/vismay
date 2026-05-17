# Backlog

Things we've decided to defer but want a paper trail for. Order is rough priority;
the actual next pick depends on what's blocking. When something lands, move it out
of here and reference the PR.

---

## E7 — Extract data-bound football components to `@vismay/footshort-viz`

E4 only moved the pure presentational components (MatchRow, StandingsTable, EntityChip).
The remaining football components couple directly to TanStack Query hooks in the app,
so they can't be moved without a refactor.

**Targets:**
- `FeedCard` (web 98 LOC, mobile 72 LOC) — news card. Uses `useSeenArticles`.
- `StoryRings` (web 74, mobile 93 LOC) — entity rings. Uses `useFollowedStories`.
- `CardSwiper` (mobile 67 LOC) — gesture handler. Pure-ish.
- `ForYouMatchFeed` (web 404, mobile **897** LOC) — the For You shell. Uses
  `useFollowedFixtures`, `useFollows`, `useStandings`, `useEntities`.

**Shape of the work:** split each into a presentational component (moves to the
vertical) plus a thin container that wires the hooks and renders the presentational
piece (stays in the app). The big one is `ForYouMatchFeed` — its prop interface
needs careful design because of how coupled it is to query state.

**Effort:** ~1–2 days, mostly for `ForYouMatchFeed`. Each smaller component is
an hour.

**Payoff:** unlocks more registered VizModules (`fs:news-card`, `fs:story-rings`,
`fs:for-you-feed`) so Vizmaya stories can embed live football widgets, not just
static match/standings data.

---

## E8 — Native rendering of viz modules (`@vismay/viz-engine-rn`)

Currently `fs:match-row`, `fs:standings-table`, and the engine core modules
(map, chart, image, video, rive, embed) are fundamentally DOM components.
They don't run on React Native. Footshort mobile's Editorial mode works
around this by opening a WebView at vizmaya.fyi.

**Two paths:**

**A. Live with the WebView.** Cheapest. Acceptable if mobile editorial usage
is modest and webview UX is good enough.

**B. Build `@vismay/viz-engine-rn`** — parallel module set with the same `VizModule`
interface but RN primitives:
- `modules/map` → rnmapbox / react-native-maps
- `modules/chart` → Victory Native / Skia
- `modules/image,video` → expo-image / Video
- `modules/rive` → `@rive-app/react-native`
- `modules/embed` → cross-WebView fallback only
- ForegroundVizSlot/BackgroundVizSlot RN variants

Story config schema stays identical. Mobile reads vizmaya.fyi's `stories` table,
parses YAML, dispatches through the RN engine. Native scrollytelling.

**Effort:** weeks. Essentially a parallel implementation.

**Trigger condition:** mobile editorial becomes a serious surface (lots of
readers, webview UX hurts retention enough to justify weeks of work).
