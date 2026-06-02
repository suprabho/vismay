# Auth across vismay.xyz and the consumer TLDs

> **Invariant.** A request lives in exactly one of three scopes:
> **A — admin cookie** (only on `*.vismay.xyz`), **B — signed URL** (admin→consumer,
> stateless HMAC token in the URL or header), or **C — public** (no auth).
> Cookies never cross top-level domains. Consumer TLDs (vizmaya.fyi, vizf1.com,
> footshorts.com) never carry an admin cookie. If you're tempted to add one,
> you want Scope B instead.

This file is the source of truth. The three implementation primitives that
back it live in [`packages/admin-core/src`](../packages/admin-core/src):

- [`auth.ts`](../packages/admin-core/src/auth.ts) — HMAC cookie session (Scope A)
- [`signedUrl.ts`](../packages/admin-core/src/signedUrl.ts) — HMAC URL token, gates Scope B page loads
- [`actionToken.ts`](../packages/admin-core/src/actionToken.ts) — HMAC action token, gates Scope B mutating API calls
- [`middleware.ts`](../packages/admin-core/src/middleware.ts) — admin cookie middleware factory
- [`signedMiddleware.ts`](../packages/admin-core/src/signedMiddleware.ts) — signed URL middleware factory

---

## Domain topology

```
ADMIN (canonical) ─────────── vismay.xyz                ← apps/admin
                              vizmaya.vismay.xyz        ↑
                              vizf1.vismay.xyz          │  same Next deployment,
                              footshorts.vismay.xyz     │  routed by hostname

CONSUMER (public) ─────────── vizmaya.fyi               ← apps/vizmaya-fyi
                              vizf1.com                 ← apps/vizf1     (todo)
                              footshorts.com            ← apps/footshorts/web
```

One admin Next app. The four `*.vismay.xyz` hostnames are DNS-level aliases
served by that one deployment — they exist to give each vertical a recognisable
URL bar in the office (`vizmaya.vismay.xyz/...` reads as "vizmaya admin")
without standing up four deployments and four cookies. Routing within the admin
app is by path (`/vizmaya/...`, `/vizf1/...`, `/footshorts/...`); the hostname
is cosmetic.

Each consumer app is a separate deployment on its own TLD. None of them ship
admin UIs or admin cookies — they only serve published content (Scope C) and
gated render outputs (Scope B).

---

## The three scopes

### Scope A — Admin cookie session

- **Where:** `vismay.xyz` and all `*.vismay.xyz` hostnames.
- **What:** HMAC cookie. Value is `HMAC-SHA256(ADMIN_SESSION_SECRET, ADMIN_PASSWORD)`. See [`auth.ts`](../packages/admin-core/src/auth.ts).
- **Cookie attrs:** `httpOnly`, `sameSite=lax`, `secure` in prod, `path=/`, `maxAge=30d`, **`domain=.vismay.xyz`** (so the cookie is shared by every vismay.xyz subdomain — one login covers them all).
- **Used for:** every admin surface — editing UIs, the canvas, the reports builder, the social monitor, any mutating API (`/api/...`).
- **On miss:** page routes redirect to `/login?next=...`. API routes return `401 application/json` so non-GET fetches don't follow a 307 into a page. Already implemented in [`middleware.ts:71-78`](../packages/admin-core/src/middleware.ts:71).

### Scope B — Signed URL + action token (admin → consumer)

Two paired primitives that share one secret. Both live in
[`packages/admin-core/src`](../packages/admin-core/src) and never touch
cookies.

**Page load — `signOutputUrl`:**
- **Where:** any consumer-TLD route that admin needs to reach (render, screenshot, iframe, capture).
- **What:** `?t=<hmac>&exp=<unix>` appended to the URL. HMAC covers `(pathname|exp)` only — extra query params are free to vary. See [`signedUrl.ts`](../packages/admin-core/src/signedUrl.ts).
- **Issued by:** admin server code calling `signOutputUrl({ baseUrl, path, ttlSeconds, query })`. The signing secret stays server-side; only the resulting URL crosses to the client / Playwright / browser.
- **Verified by:** the consumer app's middleware via `createSignedOutputMiddleware()`. Stateless — no cookie, no session store, works across any TLD.

**Mutating call — `signActionToken`:**
- **Where:** the editor (`AutoplayShell`, `ShareShell`, `AutoplayMapEditor`) on a consumer TLD calls admin's API directly to save. Carried in the `x-action-token` request header. See [`actionToken.ts`](../packages/admin-core/src/actionToken.ts).
- **What:** `v1.<exp>.<scope>.<subject>.<sig>` — a five-part bearer where HMAC covers `(version|exp|scope|subject)`. `scope` is the action (e.g. `edit-story-map`); `subject` is the resource (story slug).
- **Issued by:** the *page* that hosts the editor, after the signed-URL middleware admits the load. The page mints one token per editor surface and passes the strings to the client as props — they never go through env vars or the URL bar.
- **Verified by:** admin's API route handlers via `authedOrAction(req, scope, subject)`, which accepts either a valid admin cookie (same-origin use) or a matching action token (cross-TLD).
- **Why a second primitive:** the signed URL's signature is bound to `pathname`, which is the right shape for "GET /share." Saves go to a different path than the page (`/api/vizmaya/stories/<slug>` on admin vs `/story/<slug>/share` on vizmaya.fyi), so the URL signature can't double as the save credential. The action token carries the editor's authority over to the API call.

**TTL by intent (both kinds):**
  - **One-shot captures** (Playwright PDF / video / share card render): 5–10 min. Lifetime of one render.
  - **Editing sessions** (canvas iframes, reports builder previews, autoplay/share editors): 24 h. Long enough that a refresh isn't needed during a normal session; expired tokens 401 visibly so the cause is obvious.

**On expiry:** the next request 401s. The user reloads the admin page that minted the link → URLs and tokens get re-issued → it works again. **Don't** silently auto-refresh — the explicit failure is the feature.

**Secret:** `ADMIN_SESSION_SECRET`, shared by admin (signs both kinds) and every consumer middleware (verifies URLs; mints action tokens server-side on its own pages). One secret across all three consumer TLDs is fine — they're all trusted surfaces of the same product. If you ever need to rotate per-vertical, both primitives already take a `secretEnv` override.

**CORS:** admin's middleware ([`apps/admin/middleware.ts`](../apps/admin/middleware.ts)) allows the three consumer origins for `/api/*` paths and short-circuits OPTIONS preflight before the cookie gate. Requests carrying an action token from an allowed origin bypass the cookie check at the middleware layer; the route handler is the only place that authoritatively verifies the token. The bypass alone is not the trust check — `authedOrAction` is.

### Scope C — Public

- **Where:** consumer-TLD routes a stranger on the internet should reach without anything special. Also the public storage URLs that back social cards and downloads.
- **What:** no auth, no token, no middleware match. Just a page or a CDN file.
- **Used for:**
  - The published story page (`vizmaya.fyi/story/[slug]`)
  - Public chart-data APIs the published page fetches (`/api/chart-data/...`)
  - Social card images (`<meta og:image>`) — served from **Supabase Storage URLs**, not from the signed `/share` route. Twitter / LinkedIn / Slack unfurlers don't carry tokens.
  - PDF / MP4 downloads — same: Supabase Storage URL once rendered.
  - Future: third-party embed iframes (see [Reserved shape](#reserved-shape-public-embed) below).

The pattern: **admin renders via Scope B → output is captured → captured bytes
go to public storage → consumers reference the storage URL.** The signed route
is just the *capture surface*; the public artifact is what the world sees.

---

## Per-route map

The hard rule applied to every route we have today.

| URL | Scope | Notes |
|---|---|---|
| `vismay.xyz/login` | bypass | Issues the cookie; cannot itself require one. |
| `vismay.xyz/admin/**`, `/vizmaya/**`, `/vizf1/**`, `/footshorts/**` | A | All editing UIs. |
| `vismay.xyz/api/**` | A | Mutations. 401 JSON on miss. |
| `vismay.xyz/api/login`, `/api/logout` | bypass | Cookie lifecycle. |
| `*.vismay.xyz/**` | A | Same admin app via hostname alias; cookie shared via `domain=.vismay.xyz`. |
| `vizmaya.fyi/story/[slug]` | C | The published story. |
| `vizmaya.fyi/api/chart-data/[slug]/[id]` | C | Read-only data the page needs. |
| `vizmaya.fyi/story/[slug]/share` | B | Admin captures the share card image. |
| `vizmaya.fyi/story/[slug]/autoplay` | B | Admin captures the autoplay MP4. |
| `vizmaya.fyi/story/[slug]/canvas-frame/[id]` | B | Admin canvas iframes one section at a time. |
| `vizmaya.fyi/story/[slug]/report` | B | Admin Playwright renders the report PDF. |
| `vizmaya.fyi/story/[slug]/slides` | B | Admin Playwright renders the slides PDF. |
| `vizmaya.fyi/api/story-pdf/[slug]`, `/api/story-video/[slug]` | C | Polling endpoints called by the admin UI; they only return cached storage URLs and a status. The actual render dispatch is gated server-side by the env. **TODO: tighten to B** if these ever expose anything beyond the cached row. |
| `vizf1.com/...`, `footshorts.com/...` | B + C | Same shape as vizmaya.fyi once wired (see [Migration](#migration-from-current-state)). |
| **Social `<meta og:image>` / preview images** | C | Supabase Storage URL, public CDN. |
| **PDF / MP4 downloads delivered to users** | C | Supabase Storage URL. |
| (reserved) `vizmaya.fyi/embed/...` | C | Public third-party embed. Not implemented; shape documented below. |
| `vizmaya.fyi/reports`, `/reports/[slug]` | B | Reports builder — signed-URL gate (was cookie). Builder UI stays on vizmaya.fyi. |
| `vizmaya.fyi/api/story-report-config/[slug]` | (referer) | Same-origin referer check; admin reaches it only from inside the signed builder page. Unchanged. |
| `vizmaya.fyi/lib/adminAuth.ts`, `app/api/admin/*` | ❌ deleted | Cookie file + sync route gone in Phase 1; proxy routes (`stories`, `stories/[slug]/map`, `cues`) gone in Phase 2a. Save calls now hit admin directly with action tokens. |

---

## Two primitives, one rule

### Mint a signed link from admin

```ts
import { signOutputUrl } from '@vismay/admin-core/signedUrl'

const url = signOutputUrl({
  baseUrl: process.env.VIZMAYA_PUBLIC_URL!,  // 'https://vizmaya.fyi'
  path: `/story/${slug}/share`,
  ttlSeconds: 24 * 60 * 60,        // 24h for an editing session
  query: { ratio: '1:1' },          // not covered by signature; free to vary
})
```

The helper [`apps/admin/lib/signedConsumerLinks.ts`](../apps/admin/lib/signedConsumerLinks.ts)
wraps this for the common admin → vizmaya cases. Extend it (or add siblings)
when wiring vizf1 / footshorts.

### Verify on the consumer

```ts
// apps/<consumer>/middleware.ts
import { createSignedOutputMiddleware } from '@vismay/admin-core/signedMiddleware'

export const runtime = 'nodejs'

export const middleware = createSignedOutputMiddleware({
  // Dev without the secret falls through so the local loop isn't blocked.
  // Prod fails closed.
  passThroughWhenUnconfigured: process.env.NODE_ENV !== 'production',
})

export const config = {
  matcher: [
    '/story/:slug/share',
    '/story/:slug/autoplay',
    '/story/:slug/canvas-frame/:id',
    '/story/:slug/report',
    '/story/:slug/slides',
  ],
}
```

That's the entire consumer-side auth surface. No login page. No cookies. No
session store. The matcher is the **only** allowlist of admin-reachable routes
on that TLD; everything else is Scope C.

---

## Migration — Phase 1 (this PR)

Everything in Phase 1 is now done; the code matches the table below. Phase 2
and the OAuth swap follow once these have soaked.

### Step 1 — Lock down the admin cookie to `.vismay.xyz`

[`apps/admin/lib/adminAuth.ts`](../apps/admin/lib/adminAuth.ts) sets
`cookieDomain: '.vismay.xyz'` in production. One login at vismay.xyz covers
`vizmaya.vismay.xyz` / `vizf1.vismay.xyz` / `footshorts.vismay.xyz` since they
share the registrable base. Dev (`localhost`) leaves the attribute unset.

**Vercel preview deployments** (`VERCEL_ENV === 'preview'`) also leave the
domain unset: they're served from `*.vercel.app`, which can't hold a
`.vismay.xyz` cookie, so pinning the domain there makes login loop forever. The
cookie falls back to host-only on the preview URL — auth stays on, the password
is still required. An explicit `ADMIN_COOKIE_DOMAIN` still overrides this.

The per-vertical `ADMIN_COOKIE_DOMAIN=.vizmaya.fyi` env knob is gone; that
approach (deploy admin into a consumer TLD) is closed.

### Step 2 — Reports builder: switch the gate, don't move the UI

The reports builder ([`apps/vizmaya-fyi/app/reports/[slug]/page.tsx`](../apps/vizmaya-fyi/app/reports/[slug]/page.tsx),
`app/reports/page.tsx`) and its ~2,000 LOC of supporting components stay where
they are. What changes is the *gate*: it moves from "vizmaya.fyi admin cookie"
to "admin-signed URL." The middleware matcher on
[`apps/vizmaya-fyi/middleware.ts`](../apps/vizmaya-fyi/middleware.ts) gains
`/reports` and `/reports/:slug`; the `isAuthed()` checks come out of the page
modules.

Why this instead of moving the page to admin: the builder is tightly bound to
vizmaya-fyi's `lib/storyReportConfig.ts`, `components/MapPickerModal.tsx`,
`components/story/ThemeProvider.tsx`, and the iframe srcs it embeds. Promoting
all of that to a shared package or duplicating it into admin is a separate,
larger refactor that doesn't move the auth needle. Gate-switching achieves the
real goal — no cookie on a consumer TLD — without paying that cost.

Admin opens the builder by minting a signed URL into vizmaya.fyi (the standard
`signOutputUrl({ baseUrl: VIZMAYA_PUBLIC_URL, path: '/reports/<slug>' })`).
Saves inside the builder hit the existing
`vizmaya.fyi/api/story-report-config/[slug]` endpoint, which is referer-gated
(same-origin) — unchanged.

A future PR can still move the builder to admin once the supporting components
are factored into a shared package. The signed-URL gate keeps that door open
without requiring it now.

### Step 3 — Delete the rest of vizmaya-fyi's cookie surfaces

- [`apps/vizmaya-fyi/lib/adminAuth.ts`](../apps/vizmaya-fyi/lib/adminAuth.ts) — deleted.
- [`apps/vizmaya-fyi/app/api/admin/sync/route.ts`](../apps/vizmaya-fyi/app/api/admin/sync/route.ts) — deleted. It gated on `isAuthed()` and only ran once during the fs→DB cutover; the admin app has its own sync surface if needed.
- [`apps/vizmaya-fyi/app/demo/[clientSlug]/page.tsx`](../apps/vizmaya-fyi/app/demo/[clientSlug]/page.tsx) — the `adminBypass` (admin skip the demo password) is removed; admins use the demo password like anyone else. Cheap consistency win; demos already have per-demo passwords. If we want the bypass back, it returns as a signed-URL admin-preview link, not a cookie check.
- [`apps/vizmaya-fyi/scripts/generate-share.ts`](../apps/vizmaya-fyi/scripts/generate-share.ts) — unused `auth` import removed.

The four `/api/admin/**` proxy routes that forward cookies via
[`lib/adminApi.ts`](../apps/vizmaya-fyi/lib/adminApi.ts) (`stories/[slug]`,
`stories/[slug]/map`, `cues/[slug]`) are left in place for now. They're
upstream-broken in the new world — no admin cookie exists on vizmaya.fyi to
forward — so they 401 every request. They get deleted in Phase 2 once the
autoplay/share/cues editors have a new save mechanism (see below).

### Step 4 — Wire vizf1 and footshorts

[`apps/vizf1/web/middleware.ts`](../apps/vizf1/web/middleware.ts) and
[`apps/footshorts/web/middleware.ts`](../apps/footshorts/web/middleware.ts) are
added — verbatim copies of vizmaya-fyi's signed-URL middleware with the same
matcher (`/story/:slug/share`, `/autoplay`, `/canvas-frame/:id`, `/report`,
`/slides`). Routes that don't exist on those consumers yet are matched
harmlessly; when added later they'll be gated from day one.

[`apps/admin/lib/signedConsumerLinks.ts`](../apps/admin/lib/signedConsumerLinks.ts)
is extended to mint URLs into any of the three consumer TLDs based on a
vertical slug. Admin reads `VIZMAYA_PUBLIC_URL`, `VIZF1_PUBLIC_URL`,
`FOOTSHORTS_PUBLIC_URL` from env to pick the host. Each consumer reads
`ADMIN_SESSION_SECRET` from its own env — one shared secret across all
four deployments.

> **Footshorts caveat.** Footshorts has its own user-facing `/admin` page
> ([`apps/footshorts/web/app/admin/page.tsx`](../apps/footshorts/web/app/admin/page.tsx))
> and `/login` flow ([`apps/footshorts/web/app/login/page.tsx`](../apps/footshorts/web/app/login/page.tsx))
> backed by Supabase Auth — these are a Footshorts product feature for end
> users, not a vismay admin surface. They live in a different trust domain
> and are untouched by this migration.

### Step 5 — Set secrets

Each deployment needs:

| Deployment | `ADMIN_PASSWORD` | `ADMIN_SESSION_SECRET` | Consumer base URLs |
|---|---|---|---|
| `apps/admin` (vismay.xyz) | ✅ | ✅ | `VIZMAYA_PUBLIC_URL`, `VIZF1_PUBLIC_URL`, `FOOTSHORTS_PUBLIC_URL` |
| `apps/vizmaya-fyi` (vizmaya.fyi) | — | ✅ | — |
| `apps/vizf1/web` (vizf1.com) | — | ✅ | — |
| `apps/footshorts/web` (footshorts.com) | — | ✅ | — |

Only admin holds the password. All four know the signing secret. None of the
consumer apps need the password.

### Step 6 — Tighten the API polling routes (deferred)

`/api/story-pdf/[slug]` and `/api/story-video/[slug]` on consumer apps are
internet-reachable today; they return cached URLs and a status. If they ever
expose anything sensitive (force-re-render, dispatch a workflow), they move
under the signed-middleware matcher. Today's polling responses are fine as C
and are left as such.

---

## Phase 2 — Fast-follows

### Phase 2a — Editor save flow ✅ shipped

The autoplay and share editors run inside admin-signed pages on vizmaya.fyi
([`AutoplayShell.tsx`](../apps/vizmaya-fyi/components/autoplay/AutoplayShell.tsx),
[`AutoplayMapEditor.tsx`](../apps/vizmaya-fyi/components/autoplay/AutoplayMapEditor.tsx),
[`ShareShell.tsx`](../apps/vizmaya-fyi/components/share/ShareShell.tsx)). Their
saves used to go to a `vizmaya.fyi/api/admin/...` proxy that forwarded the
admin cookie back to vismay.xyz — broken in the new world because no admin
cookie reaches vizmaya.fyi.

**What landed:**

1. **New primitive** — [`packages/admin-core/src/actionToken.ts`](../packages/admin-core/src/actionToken.ts). `signActionToken({ scope, subject, ttlSeconds })` mints a `v1.<exp>.<scope>.<subject>.<sig>` bearer; `verifyActionToken(token, { scope, subject })` verifies. Header name is exported as `ACTION_TOKEN_HEADER` (`x-action-token`) so call sites stay in sync. Smoke test in [`actionToken.smoke.ts`](../packages/admin-core/src/actionToken.smoke.ts) covers happy path, scope/subject swaps, signature tampering, expiry, missing-secret, and malformed inputs (18 checks).
2. **Admin-side helper** — [`apps/admin/lib/authedOrAction.ts`](../apps/admin/lib/authedOrAction.ts) exports `authedOrAction(req, scope, subject)` which returns true on a valid admin cookie OR a valid action token. The three editor endpoints ([`stories/[slug]`](../apps/admin/app/api/vizmaya/stories/[slug]/route.ts), [`stories/[slug]/map`](../apps/admin/app/api/vizmaya/stories/[slug]/map/route.ts), [`cues/[slug]`](../apps/admin/app/api/vizmaya/cues/[slug]/route.ts)) call it on their mutating verbs.
3. **CORS** — [`apps/admin/middleware.ts`](../apps/admin/middleware.ts) was rebuilt to wrap the cookie middleware. For `/api/*` requests from an allowed consumer origin (`vizmaya.fyi` / `vizf1.com` / `footshorts.com`) it (a) short-circuits OPTIONS preflight before the cookie gate, (b) bypasses the cookie gate when an action token header is present so the route handler can verify it, and (c) attaches CORS response headers either way so the browser surfaces 401 bodies instead of "TypeError: Failed to fetch."
4. **Page-side minting** — [`autoplay/page.tsx`](../apps/vizmaya-fyi/app/story/[slug]/autoplay/page.tsx) mints `edit-story-map` + `edit-story-cues` tokens; [`share/page.tsx`](../apps/vizmaya-fyi/app/story/[slug]/share/page.tsx) mints `edit-story-content`. Both pages also pass the admin base URL (`NEXT_PUBLIC_ADMIN_URL`, default `https://vismay.xyz`) via [`adminBaseUrl.ts`](../apps/vizmaya-fyi/lib/adminBaseUrl.ts).
5. **Client save fetches** — the three editor components now POST/PUT/PATCH to absolute `${adminBaseUrl}/api/vizmaya/...` URLs with `credentials: 'omit'` and the `x-action-token` header. The old `/api/admin/*` proxy routes ([`adminApi.ts`](../apps/vizmaya-fyi/lib/adminApi.ts), [`stories/[slug]`](../apps/vizmaya-fyi/app/api/admin/stories/[slug]), [`stories/[slug]/map`](../apps/vizmaya-fyi/app/api/admin/stories/[slug]/map), [`cues/[slug]`](../apps/vizmaya-fyi/app/api/admin/cues/[slug])) are deleted.

**Scopes today:**

| Scope | Endpoint | Caller |
|---|---|---|
| `edit-story-content` | `PUT /api/vizmaya/stories/[slug]` | ShareShell |
| `edit-story-map` | `PUT /api/vizmaya/stories/[slug]/map` | AutoplayMapEditor |
| `edit-story-cues` | `PATCH /api/vizmaya/cues/[slug]` | AutoplayShell (tunings save) |

Other admin endpoints (`/tts`, `/report`) keep their cookie-only gate — they
only have same-origin admin callers today. When a new editor on a consumer
TLD needs them, add a scope and an `authedOrAction` call in one PR.

### Phase 2b — OAuth on Scope A (Supabase Auth swap)

Today's admin cookie is `HMAC(secret, shared password)` — single-tenant. When
either (a) a second admin user appears, (b) external reviewers need scoped
access, or (c) we want SSO via Google Workspace, Scope A's internals get
swapped to Supabase Auth.

The swap is a refactor of [`packages/admin-core/src/auth.ts`](../packages/admin-core/src/auth.ts)
only — the `Auth` interface (`isAuthed`, `setAuthCookie`, `clearAuthCookie`,
etc.) stays stable, so `createAdminMiddleware` and every call site keep
working unchanged. `signOutputUrl` / `verifySignedRequest` (Scope B) and Scope
C are entirely unaffected.

When this lands:
- `/login` becomes a redirect to the OAuth provider.
- `/api/auth/callback` exchanges the code and sets the session cookie — still
  scoped to `.vismay.xyz`, still Scope A.
- The signed URL can optionally start carrying a user claim, but doesn't have
  to.

OAuth does **not** simplify Scope B. It does not help cross-TLD. It's a
focused upgrade to Scope A, queued behind Phase 2a so we're not changing both
the gate primitive and the editor save flow in the same window.

### Phase 2c — Move reports builder to admin (optional)

Once the shared component story is sorted (probably by promoting
`storyReportConfig`, `MapPickerModal`, `ThemeProvider`, and `ReportsBuilder`
into a shared package), the reports builder page itself can move to
`apps/admin/app/vizmaya/[slug]/reports/page.tsx` and stop needing the
signed-URL gate on vizmaya.fyi. Not urgent — Phase 1's gate-switch already
gives the same auth guarantees.

---

## Operational notes

### When a signed URL expires mid-session

A 401 surfaces on the next request. The user reloads the admin page that owned
the iframe / link → URLs get re-signed → it works again. **Do not** try to
silently refresh tokens via background requests — the explicit failure is the
feature (it tells the admin their canvas tab has been open for a day).

### Why not extend TTL to infinity

The signed URL itself is a bearer token: anyone who copies the full URL with
its `t` and `exp` can use it. Short TTLs mean a leaked URL stops working in
hours, not forever. 24h is the long end; 5 min for one-shot captures is the
short end. Don't push past 24h without a reason.

### Why not encode user identity in the token

Admin today is single-tenant (one shared password). The signed URL grants
"render this resource on this consumer domain" — it doesn't need a user id.
When admin moves to per-user accounts (likely via Supabase Auth), the cookie in
Scope A becomes the user session and the signed URL can carry a user claim if
needed. The primitive is forward-compatible.

### Why not use cookies on consumer TLDs at all

Three reasons, in order:

1. **The browser won't let you anyway.** A `vismay.xyz` cookie cannot be read
   by `vizmaya.fyi`. No `Domain=` attribute makes this work — they're different
   registrable domains.
2. **Third-party cookie blocking** (Safari ITP, Chrome's deprecation) breaks
   any scheme that relies on iframe-set or redirect-set cookies across TLDs.
3. **It hides the trust model.** With signed URLs, every cross-TLD request
   shows up in logs as "admin minted this; consumer verified that". With
   cookies, you'd be juggling per-TLD sessions, redirect flows, and stale
   cookies — exactly the mess we just got out of.

---

## Anti-patterns (don't reach for these)

- **A cookie on a consumer TLD.** If you find yourself adding `createAuth(...)`
  in `apps/vizmaya-fyi` (or vizf1 / footshorts), stop. Use a signed URL.
- **Sharing `localStorage` across TLDs.** It can't. The Same-Origin Policy is
  per-origin, and origins include the host.
- **Re-issuing the signed token on the fly via JS.** The secret must stay
  server-side. Minting happens in a server component or API route on admin;
  the client only ever sees the resulting URL.
- **Passing the admin cookie value into a URL.** That's strictly worse than a
  signed token: it has no path/expiry binding and grants full admin if leaked.
- **`X-Frame-Options: SAMEORIGIN` on consumer-TLD routes that admin iframes.**
  Admin (vismay.xyz) is *not* same-origin to vizmaya.fyi. Use `frame-ancestors`
  in CSP and list the admin origins explicitly.

---

## Reserved shape: public embed

When a partner needs to embed a Vizmaya chart on their own site, the right
shape is a **Scope C** route on the consumer TLD:

```
vizmaya.fyi/embed/[slug]/[id]
```

- No signature. No login. Public.
- Sandboxed: returns a minimal HTML doc with the single chart/map and a CSP
  that disallows top-level navigation.
- `Content-Security-Policy: frame-ancestors *` (or a narrow allowlist if you
  ever want to gate embedding to partner domains).
- No nav, no admin UI, no fetches outside the chart's data API.

Not implemented today. Add when a real use case shows up. The route name is
reserved so we don't accidentally use `/embed/...` for something else and have
to migrate.

---

## Glossary

- **Registrable domain (eTLD+1).** `vismay.xyz`, `vizmaya.fyi`, `vizf1.com`,
  `footshorts.com`. The boundary the browser enforces for cookies.
- **Consumer TLD.** One of vizmaya.fyi / vizf1.com / footshorts.com — where
  published content lives.
- **Output route.** A consumer-domain route that exists for admin to capture
  or iframe, not for end-users to browse to. Share, autoplay, canvas-frame,
  report, slides.
- **Signing secret.** `ADMIN_SESSION_SECRET`. Shared between the admin app
  (mints) and every consumer app (verifies). Long random string, rotated
  rarely.
