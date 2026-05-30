# Native story reader — scope & migration plan

> How consumer apps (vizf1, footshorts web + mobile, future apps) move from
> **embedding** the vizmaya story view to **rendering it natively** with their
> own branding.

## TL;DR

Today every consumer app shows long-form editorial by **embedding vizmaya.fyi** —
an `<iframe>` on web, a `WebView` on mobile — via [`@vismay/story-embed`](../packages/story-embed).
That is an intentional stopgap. The long-term target is each app **rendering the
story natively** via [`@vismay/story-reader`](../packages/story-reader), with its
own theme/chrome, on web (SSR/SSG) and mobile (React Native).

Sequencing (preferred):

- **Phase A — native web render + per-app capture** (workstreams **#3 + #5**). Both
  sit on the *web* render, so they ship together: native branded stories **and**
  branded PDF/video/share exports across all web apps, in one pass.
- **Phase B / C — native mobile render** (workstream **#4**). The separable big
  lift (native maps/charts/scroll/modules); done after the web foundation is proven.

The embed stays behind a flag as the fallback the whole way.

## Status — what already exists

- **`@vismay/story-reader`** — the scroll-synced shell + ~20 editorial blocks,
  extracted from vizmaya-fyi and **brand-agnostic**: logo / aura / home-link are
  injected via `LogoComponent` / `AuraComponent` / `LinkComponent` props, and no
  `next/*` import remains. **Renders on web today** (vizmaya consumes it through
  thin app-side adapters).
- **`@vismay/story-embed`** — the interim embed: `/web` (iframe), `/native`
  (react-native-webview), `/url` (`storyUrl` + `VIZMAYA_ORIGIN`). Branding is
  overlaid via `children`. This is the current consumption path for vizf1/web,
  footshorts/web, footshorts/mobile.
- **Published stories are Scope C / public** ([`docs/auth.md`](auth.md)) and
  **assets resolve to a public Supabase bucket** (`resolveAssetUrl`, `assets://`
  → `/storage/v1/object/public/story-assets/`). → **No auth blocker for v1.**
- The VizModule **registry already supports web/native variants** (verticals
  expose `./web` + `./native` subpaths; native impls are stubs today).
- The capture **handlers/dispatch in `content-source` are already
  origin-parameterized** (`baseUrl` derived from the request).
- `docs/auth.md` already reserves consumer TLDs to serve content "the same shape
  as vizmaya.fyi" (Scope B + C) — i.e. native serving is the documented end state.

## Why the iframe is interim, not the end state

Not third-party cookies — published content is public, so cross-origin framing
works *today*. It fails long-term on:

1. **Theming.** The story renders in vizmaya's theme + chrome; a host can only
   overlay. No per-brand story (F1 red, footshorts green), no host typography.
2. **Performance.** Every story loads a *second entire Next app* in a frame
   (double framework + network). Rough on mobile/cellular.
3. **Mobile = WebView, not native.** No native scroll/gestures/offline/
   deep-linking; scrollytelling-in-a-webview is the jankiest version.
4. **Black box.** No shared nav, analytics, share, or deep-links into sections;
   `postMessage` only.
5. **Coupling / SPOF.** Every app hard-depends on vizmaya.fyi uptime + URL shape
   + a permissive `frame-ancestors` CSP.
6. **SEO / social.** Iframed content isn't in the host document → invisible to
   the consumer domain's SEO and unfurls.
7. **Future gating.** Cookies can't cross TLDs (hard rule in auth.md), so the day
   a story is gated/personalized per consumer-app *user*, the frame can't carry
   that session.

> The sanctioned `vizmaya.fyi/embed/[slug]/[id]` "reserved shape" in auth.md is a
> *minimal single-chart* partner embed — not a substitute for full-story rendering.

## Target architecture

Each app: **load** published story data from the shared store → **resolve** to
`StoryReaderProps` → **render** `<StoryReader>` with the app's theme + chrome.
Web = SSR/SSG; mobile = native RN. Assets via the public bucket. Downloads/share
produced from each app's own web render (Phase A) and linked from public storage.

## Workstreams (full scope)

### 1. Shared `loadStory()` resolver — *small; ~80% exists*
Today `apps/vizmaya-fyi/app/story/[slug]/page.tsx` inlines the resolution chain.
Extract it into one `loadStory(slug)` (in `content-source`, or a new
`@vismay/story-data`) returning `StoryReaderProps`, so every app gets the props
from a single call. See [the seam](#the-loadstory-seam) below.

- **Decision:** apps read Supabase directly (`content-source` db mode, anon key,
  published rows + RLS) **vs.** a thin content API exposed by admin/vizmaya.
  Recommend direct-read for v1 (published = public); add an API only if you don't
  want Supabase creds in every app or want a frozen contract.

### 2. Assets & fonts — *small*
`assets://` already resolves to the public bucket via `resolveAssetUrl`
(viz-engine), so any app with `NEXT_PUBLIC_SUPABASE_URL` works. Web fonts load via
`getFontImportUrl` (Google Fonts `<link>`); **native needs an `expo-font`
strategy** for the same families.

### 3. Web native rendering — *medium; the cheap win, renderer is done*
vizf1-web / footshorts-web get a real `/story/[slug]` (or `/editorial/[slug]`)
that calls `loadStory()` server-side and renders `<StoryReader>` with the app's
theme + chrome, **deleting the iframe on web**. Per app: add `content-source` +
env + the Tailwind `@source` for `@vismay/story-reader` (same wiring vizmaya
already has). This route set **includes the capture output routes** (see #5).

### 4. Mobile native rendering — *large; the real lift*
Build `@vismay/story-reader/native`. Web-DOM tech that must be replaced:

| Concern | Web (today) | Native target |
|---|---|---|
| Maps | `mapbox-gl` / `react-map-gl` / `deck.gl` | `@rnmapbox/maps` (deck.gl overlays reimplemented or dropped; static snapshot as v1 fallback) |
| Charts | `echarts` / `echarts-for-react` | Victory Native / `react-native-skia` (or a per-chart WebView island as a bridge) |
| Scrollytelling | CSS scroll-snap + `IntersectionObserver` | RN `ScrollView` snap + `onViewableItemsChanged` / Reanimated |
| Blocks | `div`/`span` + Tailwind | RN `View`/`Text` + NativeWind (already in footshorts mobile) |
| Animation | `gsap` | `react-native-reanimated` |
| Rive | `@rive-app/react-canvas` | `rive-react-native` |
| `html-to-image` | DOM→image capture | N/A (capture stays server-side, #5) |

Plus: fill the verticals' empty `./native` module stubs
(`verticals/{f1-viz,footshorts-viz,starship-viz}/src/native/`).

### 5. Capture / exports generalized per app — *medium; rides on #3*
The PDF/video/audio/share pipeline Playwright-screenshots the **web** story
render, so it sits on the same foundation as #3.

**Already app-agnostic** (in `content-source`):
- `handlers/storyPdf.ts` derives `baseUrl` from the request; takes a `dispatch` callback.
- `storyPdfDispatch.ts` / `generate-*.ts` are parameterized by `baseUrl` / `BASE_URL`.

**App-coupled surface to generalize:**
1. **Output routes** (`/story/[slug]/report`, `/slides`, `/share`, `/autoplay`) —
   these *are* the reader in print/capture mode, so **#3 gives them to each app for free**.
2. **Workflows** `.github/workflows/render-*.yml` — hard-wired
   `working-directory: apps/vizmaya-fyi` + `default: https://vizmaya.fyi`; need an
   `app`/`origin` input (or per-app workflows).
3. **Scripts** in `apps/vizmaya-fyi/scripts/generate-*.ts` are origin-generic —
   move to a shared location or invoke per-app.
4. **Buckets** (`story-pdf`, `story-video`, …) — namespace by app for branded artifacts.

**Land it on the GCP migration** ([`docs/gcp-render-migration.md`](gcp-render-migration.md)):
that's one `render-runner` image dispatched by `JOB_TYPE`. Add an `APP`/`ORIGIN`
parameter and a single render fleet serves every app.

### 6. Theming model — *decision, low eng*
Do stories keep their authored theme everywhere (editorial integrity + host
chrome), or adopt each host's brand? `story-reader`'s `ThemeProvider` supports
either; pick per product intent.

### 7. Auth / gating — *future, only if needed*
v1 is published/public = zero auth work. If editorial later gets gated or
personalized per consumer-app user, each app authorizes its **own** reads (RLS by
app + user); cookies still never cross TLDs (auth.md hard rule).

### 8. The standing tax
`story-reader` then carries **two render paths** (web DOM + native RN). Every new
block/feature is built twice unless logic stays headless and only the leaf
rendering is platform-split. This is the genuine long-term cost of native mobile —
design blocks as headless-logic + thin platform leaves from here on.

## The `loadStory()` seam

The chain `apps/vizmaya-fyi/app/story/[slug]/page.tsx` runs today, to extract:

```
getStoryContent(slug)                         // @vismay/content-source/content
loadStoryConfig(slug) / hasStoryConfig(slug)  // …/storyConfig
hydrateFootshortsConfig(config)               // …/hydrateFootshortsConfig (vertical hook)
getContentSource().readMapYaml(slug)          // …/contentSource  → parseMapOverrides (viz-engine)
resolveUnits(slug, sections, config)          // …/resolveUnits
resolveSectionLogoPalettes(theme, …)          // @vismay/viz-engine
themeToMapPalette(theme)                       // app-local in vizmaya — MOVES into the shared loader
getFontImportUrl(theme.fonts)                  // …/getFontImports
        ↓
StoryReaderProps { slug, theme, vertical, format, units, mobileUnits,
                   defaults, mapOverrides, logoPalettes, accessToken, aura }
```

Host stays responsible for: `generateStaticParams`/`generateMetadata`, `<head>`
font/preconnect tags, `notFound()`, and injecting branding props
(`LogoComponent`/`AuraComponent`/`LinkComponent`). `themeToMapPalette` is the one
piece still app-local in vizmaya — it moves into the shared loader.

## Phase A task breakdown (ready to pick up)

1. Extract `loadStory(slug) → StoryReaderProps` (move `themeToMapPalette` in with it).
2. vizf1-web: `/story/[slug]` server route → `loadStory` → `<StoryReader>` with F1
   theme + chrome; add `content-source` dep + env + Tailwind `@source`; point
   `/editorial/[slug]` at it (drop the iframe).
3. footshorts-web: same, with footshorts theme.
4. Port the capture output routes (`/report`, `/slides`, `/share`, `/autoplay`) to
   the consumer apps (thin wrappers over the reader in print/capture mode).
5. Parameterize the capture pipeline by `app`/`origin`/bucket — fold into the GCP
   `render-runner` (`APP`/`ORIGIN` input) per `docs/gcp-render-migration.md`.
6. Keep `@vismay/story-embed` behind a flag as the fallback.
7. Verify: typecheck + a real story rendering natively in each web app; a branded
   PDF/share produced per app.

## Open decisions

- **Data access:** direct Supabase read vs. content API (recommend direct for v1).
- **Theming:** authored story theme vs. host brand theme.
- **Bucket namespacing:** path prefix vs. per-app buckets for branded exports.
- **Native viz strategy (B/C):** native renderers vs. bridged WebView/static islands for charts & maps in the first mobile cut.

## References

- [`packages/story-reader`](../packages/story-reader) — the native reader (web today).
- [`packages/story-embed`](../packages/story-embed) — the interim embed.
- [`docs/auth.md`](auth.md) — scopes, public/Scope C, cross-TLD cookie rule.
- [`docs/gcp-render-migration.md`](gcp-render-migration.md) — the render fleet to extend for per-app capture.
