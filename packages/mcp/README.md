# @vismay/mcp

An MCP (Model Context Protocol) server that exposes the Vismay viz-engine and
its **verticals** as tools, so an orchestrator agent can render Vismay
visualizations and combine them with other MCP video services — e.g. **HeyGen**
(talking avatars) and **Higgsfield** (cinematic image-to-video). Vismay is the
visual *source*; those services are *animators/presenters* the agent drives. See
[Adding more video providers](#adding-more-video-providers-higgsfield-) below.

## Why this exists (HeyGen + Vismay)

HeyGen ships an official **Remote MCP server**, but it only acts as an MCP
*server*: it exposes *its own* video tools (`generate_avatar_video`,
`get_voices`, `get_avatar_groups`, `get_avatars_in_avatar_group`,
`get_avatar_video_status`, `get_remaining_credits`) **to** an agent. HeyGen has
no way to consume a third-party MCP inside its own workflows.

So we flip the architecture. An **orchestrator agent** (Claude Desktop / Claude
Agent SDK / Cursor) connects to *both* MCP servers and bridges them:

```
   Vismay MCP (this) ──┐                          ┌── HeyGen Remote MCP
    list_modules       │   Orchestrator agent     │   generate_avatar_video
    render_module_image│  (Claude / Agent SDK) ◄──┤   list avatars / voices
    render_story_video │   bridges both servers   │   get_avatar_video_status
    embed_url        ──┘                          └──
```

Typical flow: the agent calls `list_modules` to discover a module + its config
schema, calls `render_module_image` (with `transparent: true`) or
`render_story_video` to produce an asset, then passes that asset to HeyGen's
`generate_avatar_video`.

**Compositing limitation:** HeyGen's `generate_avatar_video` MCP tool produces an
avatar video; it does not composite an arbitrary Vismay image/video as a
background/overlay. True overlay needs HeyGen's full REST API *or* a final local
`ffmpeg` overlay step. A future `composite_avatar_over_viz` tool here could close
that gap (the video pipeline already shells `ffmpeg`).

## Adding more video providers (Higgsfield, …)

This server is **provider-agnostic**. It doesn't call any video service itself —
it just exposes Vismay's visuals. To add a provider, register *its* MCP connector
in your agent alongside Vismay; the agent bridges the two. **No changes to this
package are needed.** The same pattern that works for HeyGen works for any
MCP-server video provider.

### Higgsfield

Higgsfield runs a hosted MCP at `https://mcp.higgsfield.ai` (OAuth, no API key —
same one-click onboarding as HeyGen). Its tools include `generate_image`,
`generate_video` (text- **and** image-to-video across 30+ models incl. Sora, Veo,
Kling), `create_character`, `get_generation_status`, and a local-file upload tool
that returns a hosted URL.

Its flagship mode is **image-to-video**, which is a direct fit for
`render_module_image` — turn a still viz into a cinematic motion clip:

1. Vismay `render_module_image { type, config, transparent: true }` → viz PNG.
2. Higgsfield upload tool → hosted `image_url` for that PNG.
3. Higgsfield `generate_video { model_id, image_url, prompt: "slow push-in, cinematic" }`.
4. Poll `get_generation_status`, download the output URL.

HeyGen gives you a *talking presenter*; Higgsfield gives you *cinematic motion on
the viz itself*. They're complementary and use the same agent-as-bus flow.

> **Handoff note:** Higgsfield's `generate_video` needs a public `image_url`.
> Higgsfield's own upload tool covers this today (step 2). The planned
> `returnAs:'url'` option on `render_module_image` — upload the PNG to a Supabase
> public bucket and return the URL — would collapse steps 1–2 into one for any
> image-to-video provider.

## Tools

| Tool | Browser? | What it does |
|------|----------|--------------|
| `list_verticals` | no | Verticals + core, with module counts. |
| `list_modules` | no | Every module with slots, admin-form fields, and config JSON Schema. |
| `embed_url` | no | A live, iframe-able URL rendering one module from a config. |
| `render_module_image` | yes (catalog) | Screenshot one module to a PNG (base64 or saved path). |
| `render_story_video` | yes (vizmaya-fyi) | Render a story (or a section clip) to an MP4 URL. |
| `get_html_story_brief` | no (calls the deployed site, falling back to a local house brief) | The brief to read before writing a vizmaya, footshorts, vizf1, viznba or travel HTML story (`app`). `randomStyle: true` swaps the house look for a palette + fonts from an existing story. For footshorts, `fixtureIds` (up to 40) appends the match context — Opta facts, timeline, insights, commentary, schedules, table — with an optional `prompt`. For vizf1, `sessionKeys` (up to 24 telemetry session keys, e.g. `2026_australian_grand_prix_R`, across races and seasons) and `drivers` (up to 8 codes like `VER`) append the race context — results, lap timing, telemetry, strategy, the head-to-head across sessions, the standings round by round. For viznba, `gameIds` (up to 12 ESPN event ids) append the game context — each game's box score from ESPN. For travel, `tripSlug` (and optionally `day`) appends the trip context — the itinerary and the curated photos' URLs. |
| `publish_html_story` | no (calls the deployed site) | Publish a self-contained HTML story to `vizmaya.fyi/s/<slug>` or, with `app: "footshorts"` / `app: "vizf1"`, `footshorts.com/s/<slug>` / `www.vizf1.com/s/<slug>`, or `app: "viznba"` the VizNBA site's `/s/<slug>`, or `app: "travel"` the trips site's `/s/<slug>` (private to the trip the page names in `<meta name="travel:trip">`). `spinId` ties the page to a randomizer spin. |
| `save_story_image` | no (calls the deployed site) | Host an openly licensed photo or mp4 for an HTML story (`slug`) on the site's storage, from its https URL (`fromUrl`) or a local `filePath`, with its `credit` and `license`. Returns the permanent `url` to use in the page. |
| `generate_story_image` | no (calls the deployed site) | Generate an AI illustration for an HTML story (`slug`, `prompt`, `aspectRatio`) through the site's AI gateway and host it the same way. Spends gateway credits. |
| `spin_randomizer` | no (calls vizmaya.fyi, or footshorts.com for `footshorts`, the VizNBA site for `viznba`) | Draw and log a story topic from the Vizmaya randomizers (`desk`, `atlas`, `epics`, `ledger`, a past financial crime researched as an autopsy: an era, a sector, a typology, a case and a lens, gated; `ocw`, the OCW Desk: a field, a topic, a course and one lecture-notes file from MIT OpenCourseWare, read live, plus a lens; `sequence: true` walks on to the next resource in the previous spin's course; and `landmark`, the Landmark Desk: a field, a prize, an era, a laureate read live from the Nobel Prize API or Wikidata, the paper or book the award rewarded, labelled representative when the award record does not name it, plus a lens; `sequence: true` follows the prize back a year; and `hundred`, The 100 Desk: one person from Michael Hart's ranking of the most influential persons in history, drawn by domain, era and person, plus a lens, with a live profile from Wikidata, Wikipedia and its pageviews; `sequence: true` walks on to the next rank; and `evidence`, the Evidence Desk: one of 83 studies from an annotated collection of research on social media's effects, drawn by theme, design and study, plus a lens, with a live citation record from OpenAlex; `sequence: true` follows the debate to a linked study; and `frontier`, the Frontier Desk: one arXiv paper from the papers AI Daily keeps each morning, drawn by area, window and paper, plus a lens, with a live record from arXiv and OpenAlex; `sequence: true` follows the thread to a paper sharing its tags or benchmark; and `curious`, the Curious Desk: one claim a day from the ones the claim pipeline's reviewers approved, drawn by era, theme and claim weighted by its A to E grade, plus a lens, with a live record from Crossref, Google Books, Wikidata and the Wayback Machine; gated; `sequence: true` pulls the thread to a claim sharing a name), the Football Desk for footshorts (`footshorts`: tournament, team, angle, freshness, weighted by footshorts news) or the NBA Desk for viznba (`viznba`: conference, franchise, angle, freshness, weighted by VizNBA news; see `packages/randomizer`), with locks (`from` + `locks`), re-spins (`respin` + `reason`), Atlas pair spins, Football Desk and NBA Desk head-to-heads (`pair`) and Epics sequence mode. Pass the returned id as `spinId` to `get_html_story_brief` (with `app: "footshorts"` for a Football Desk spin, `app: "viznba"` for an NBA Desk spin) for the spin's full brief. |
| `get_randomizer_spin` | no (calls vizmaya.fyi, or footshorts.com with only its token) | One spin: reels, rules, status, hero insight, reviewer note and research stub. |
| `save_spin_research` | no (same) | Save a spin's research MD (claims log, HERO INSIGHT). Atlas and Epics insights then wait for approval in admin. |
| `get_football_news` | no (calls footshorts.com) | The Football Desk's live news table: tournaments and teams with fixtures, their news heat over 14 days, headlines and fixtures. Computed from the footshorts feed, nothing to refresh. |
| `get_ocw_pool` | no (calls vizmaya.fyi) | What the OCW Desk draws from, live from MIT Learn's API: with `topic` and `kind`, a page of OCW files of that kind under the topic (title, URL, course, term, the total and the page's offset; `u` picks where the page starts); with `course` and `kind`, every file of the kind in that course; with nothing, the taxonomy (fields, topics with file counts per kind, kinds, lenses). Logs nothing. |
| `get_landmark_pool` | no (calls vizmaya.fyi) | What the Landmark Desk draws from, live: with `prize` and `era`, every award of that prize in that era (year, laureate, the official motivation, share and co-laureates, the works the award record names, links) from the Nobel Prize API or Wikidata; with `laureate` too, that laureate's works as a spin sees them (named, notable, top-cited from OpenAlex with the server's key, books from Open Library, free-to-read links) and how each source fared; with nothing, the taxonomy (fields, prizes with award counts per era, eras, lenses). Logs nothing. |
| `get_hundred_pool` | no (calls vizmaya.fyi) | What The 100 Desk draws from: with nothing, Hart's whole ranking as the desk holds it (the book, domains, eras, regions, the 100 people with their rank, Wikidata item, life years and flags, the lenses); with `rank` (1 to 100), that person's live profile as a spin reads it (Wikidata dates, places and coordinates, portrait unless withheld, the Wikipedia summary, a year of monthly pageviews) and how each source fared. Logs nothing. |
| `get_evidence_pool` | no (calls vizmaya.fyi) | What the Evidence Desk draws from: with nothing, the whole annotated collection of research on social media's effects as the desk holds it (summary, key findings, caveats, 7 themes with their evidence verdicts, 6 designs, the 83 studies with citation, DOI, design, sample, findings, linked studies and flags, the lenses); with `study` (1 to 83), that study's live citation record as a spin reads it (OpenAlex citations by year, field-weighted impact, retraction, free-to-read link) and how each source fared. Logs nothing. |
| `get_curious_pool` | no (calls vizmaya.fyi) | What the Curious Desk draws from, live from `curious_claim_pool`: with nothing, the eras, regions, themes, grades and lenses, how many approved claims sit in each era and theme, the grade counts and the 30 newest approvals (claim, kind, era, theme, grade, flags, evidence quote, document, sources and lineages); with `claim` (a claim id), that claim and its live record as a spin reads it (the cited work on Crossref, the cited book on Google Books, the entities on Wikidata, a Wayback snapshot of the evidence document) and how each source fared. Logs nothing. |
| `get_ledger_pool` | no (calls vizmaya.fyi) | What Ledger draws from: with nothing, the committed catalogue of past financial crimes (eras, sectors, typology families with their checks, charts and sources, typologies, lenses, regions, outcomes, detection routes, scale bands and the 240 cases, each with today's era and its legal status; live cases with their note and search leads); with `case` (a case id), that one case. Seed values and leads, not verified sources. Logs nothing. |
| `get_frontier_pool` | no (calls vizmaya.fyi) | What the Frontier Desk draws from, live from AI Daily's `dc_papers`: with nothing, the areas, windows and lenses, how many kept papers sit in each area and window, and the 30 newest (arXiv id, title, authors, area, the gate's headline benchmark, compute, release, why it matters, importance, the Doom v Boom editions that featured it); with `paper` (an arXiv id), that paper's live record as a spin reads it (latest arXiv version, journal reference, the authors' comment, OpenAlex citations) and how each source fared. Logs nothing. |
| `get_nba_news` | no (calls the VizNBA site) | The NBA Desk's live news table: both conferences and all 30 franchises, their news heat over 14 days, headlines, the people in the news, and recent and next games from ESPN. Computed live, nothing to refresh. |
| `get_desk_heat` / `refresh_desk_heat` | no (calls vizmaya.fyi) | Read every Desk segment's heat and staleness, and write a refresh (heat, headlines, failures). Run it weekly. |

## Environment

| Var | Needed by | Default |
|-----|-----------|---------|
| `CATALOG_BASE_URL` | embed_url, render_module_image | `http://localhost:3100` |
| `VIZMAYA_BASE_URL` | render_story_video | `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | render_story_video | — (required) |
| `SUPABASE_SERVICE_ROLE_KEY` | render_story_video | — (required) |
| `SCREENSHOT_DIR` | render_module_image (`returnAs:'path'`) | `/tmp/vismay-mcp-screenshots` |
| `VISMAY_REPO_ROOT` | render_story_video | auto-derived |
| `HTML_STORIES_URL` | publish_html_story, get_html_story_brief, save_story_image, generate_story_image | `https://www.vizmaya.fyi` |
| `HTML_STORIES_TOKEN` | publish_html_story, save_story_image, generate_story_image, the randomizer tools | — (required; same value as on the vizmaya-fyi deployment) |
| `FOOTSHORTS_HTML_STORIES_URL` | publish_html_story, get_html_story_brief (`app: "footshorts"`) | `https://www.footshorts.com` |
| `FOOTSHORTS_HTML_STORIES_TOKEN` | publish_html_story, the image tools and the match-context brief for footshorts | falls back to `HTML_STORIES_TOKEN` (same value as on the footshorts web deployment) |
| `VIZF1_HTML_STORIES_URL` | publish_html_story, get_html_story_brief (`app: "vizf1"`) | `https://www.vizf1.com` |
| `VIZF1_HTML_STORIES_TOKEN` | publish_html_story, the image tools and the race-context brief for vizf1 | falls back to `HTML_STORIES_TOKEN` (same value as on the vizf1 web deployment) |
| `VIZNBA_HTML_STORIES_URL` | publish_html_story, get_html_story_brief (`app: "viznba"`), the NBA Desk tools | `https://nba.vizmaya.fyi` |
| `VIZNBA_HTML_STORIES_TOKEN` | publish_html_story, the image tools, the game-context brief and the NBA Desk for viznba | falls back to `HTML_STORIES_TOKEN` (same value as on the viznba web deployment) |
| `TRAVEL_HTML_STORIES_URL` | publish_html_story, get_html_story_brief (`app: "travel"`) | `https://protrip.vismay.xyz` |
| `TRAVEL_HTML_STORIES_TOKEN` | publish_html_story, the image tools and the trip-context brief for travel | falls back to `HTML_STORIES_TOKEN` (same value as on the travel web deployment) |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | get_html_story_brief, only when the site can't be reached (the brief is then built locally) | — (without it that brief has no Mapbox maps section) |

The metadata tools (`list_verticals` / `list_modules`) need none of these.

Point the `*_URL` vars at each site's canonical host. The tools never follow a redirect to
another host with a publish token ([`src/siteFetch.ts`](src/siteFetch.ts)), since fetch drops
the `Authorization` header on one and the site would answer "unauthorized"; they fail with
an error naming the host to set instead.

## Prerequisites for the rendering tools

- `render_module_image` / `embed_url`: the **@vismay/catalog** dev server running
  at `CATALOG_BASE_URL`. Run it on a dedicated port:
  ```
  PORT=3100 pnpm --filter @vismay/catalog dev
  ```
- `render_module_image`: Playwright Chromium — `npx playwright install chromium`.
- `render_story_video`: the **vizmaya-fyi** dev server at `VIZMAYA_BASE_URL`,
  `ffmpeg` on PATH, Playwright Chromium, Supabase service creds, and the story
  must already have audio generated
  (`pnpm --filter vizmaya-fyi exec tsx scripts/generate-audio.ts <slug>`).

## Quick start (dev)

From the repo root, one command brings up the catalog (`:3100`) and the MCP
Inspector wired to it, so you can call every tool interactively:

```
pnpm mcp:dev                  # catalog + MCP Inspector together
WITH_VIZMAYA=1 pnpm mcp:dev   # also start vizmaya-fyi (:3000) for render_story_video
```

`Ctrl-C` stops everything. When your *agent* (not the Inspector) drives the MCP,
you only need the catalog running — `pnpm mcp:catalog`.

## Run / register

```
pnpm --filter @vismay/mcp dev        # stdio; waits for a client
pnpm --filter @vismay/mcp inspect    # launch @modelcontextprotocol/inspector
```

Register as a custom connector in an MCP client:

```json
{
  "mcpServers": {
    "vismay": {
      "command": "tsx",
      "args": ["/abs/path/to/packages/mcp/src/cli.ts"],
      "env": {
        "CATALOG_BASE_URL": "http://localhost:3100",
        "VIZMAYA_BASE_URL": "http://localhost:3000",
        "NEXT_PUBLIC_SUPABASE_URL": "https://…",
        "SUPABASE_SERVICE_ROLE_KEY": "…"
      }
    }
  }
}
```

Transport is **stdio**. For remote use there is also the hosted endpoint below.

## Hosted endpoint

vizmaya-fyi serves the same server over **Streamable HTTP** at two URLs
([routes](../../apps/vizmaya-fyi/app/api/mcp/) → [`src/hosted.ts`](src/hosted.ts)):

| URL | For |
|-----|-----|
| `https://www.vizmaya.fyi/api/mcp` | **Sign in.** An MCP client that connects with no credentials gets a 401 that opens the sign-in ([`src/oauth.ts`](src/oauth.ts)). Signed in, it has every hosted tool. |
| `https://www.vizmaya.fyi/api/mcp/public` | **No sign-in.** The open tools for anyone. |

Use the `www` host: `vizmaya.fyi` redirects to it, and MCP clients drop the sign-in
token on a redirect to another host, so a connector saved with the bare domain signs in
and then fails every call.

Both are stateless: every POST builds a fresh server and answers with JSON, so they
run on Vercel functions with no session store. GET and DELETE answer 405.

| Caller | Tools |
|--------|-------|
| Anyone (`/public`) | `get_html_story_brief` (the plain brief, styles, formats; the match, race, game and trip contexts still need a token). With `CATALOG_BASE_URL` set on the vizmaya-fyi deployment, also `list_verticals`, `list_modules` and `embed_url`. |
| Signed in (`/api/mcp`), or with a publish token (either URL) | Also `publish_html_story`, `save_story_image`, `generate_story_image` and every randomizer, pool and news tool. |
| Nobody (local server only) | `render_module_image`, `render_story_video`, the HeyGen tools, and every `filePath` argument. |

### Connect

**Claude app:** Settings → Connectors → Add custom connector, paste
`https://www.vizmaya.fyi/api/mcp`, click **Connect**. A vismay.xyz page asks you to sign
in to admin (or just to click **Allow** if you're signed in), and you're back in
Claude with every tool.

**Claude Code:**

```
claude mcp add --transport http vismay https://www.vizmaya.fyi/api/mcp
```

then run `/mcp` and pick `vismay` to sign in in the browser. Cursor works the same
way. The token header still works for scripts and CI:
`--header "Authorization: Bearer <publish token>"`.

### How the sign-in works

vizmaya.fyi is both the protected resource and its OAuth authorization server
(issuer = the site's origin; previews and local dev get their own):

1. The 401's `WWW-Authenticate` names the protected resource metadata
   (`/.well-known/oauth-protected-resource/api/mcp`, RFC 9728), which names the issuer;
   its metadata is at `/.well-known/oauth-authorization-server` (RFC 8414).
2. The client registers itself (`/api/mcp/oauth/register`, RFC 7591): public clients
   with PKCE, or secret ones.
3. `/api/mcp/oauth/authorize` checks the request (registered redirect URI, PKCE S256,
   the resource) and sends the browser to **admin's consent page**,
   `vismay.xyz/mcp/authorize/<signed request>`. People only ever sign in on admin.
4. Admin checks the admin session and shows the app's name and where the sign-in goes
   (the redirect's origin, since the name is the app's own claim). **Allow** signs an
   approval for exactly that request and sends the browser to
   `/api/mcp/oauth/callback`, which issues a code. The request and approval are signed
   with keys derived from `ADMIN_SESSION_SECRET`, which both deployments already hold
   (`@vismay/admin-core/mcpConsent`, Scope B in [docs/auth.md](../../docs/auth.md)).
5. `/api/mcp/oauth/token` swaps the code (with the PKCE verifier) for a 1-hour access
   token bound to `/api/mcp` and a refresh token. A sign-in lasts at most 90 days
   however often it is refreshed; then the app asks again.

Everything is stateless (signed client ids, codes and tokens, no table). Two costs,
accepted for a single-admin service: a code can be redeemed more than once in its 5
minutes (PKCE still binds it to the app that asked), and tokens can't be revoked one
at a time. **To sign every app out**, set or bump `MCP_TOKEN_GENERATION` on the
vizmaya-fyi project. Rotating `ADMIN_SESSION_SECRET` also does it, and signs admins out.

**Signed-in calls use the deployment's own publish tokens**, read like the local
server's env: `HTML_STORIES_TOKEN`, and `FOOTSHORTS_HTML_STORIES_TOKEN`,
`VIZF1_HTML_STORIES_TOKEN`, `VIZNBA_HTML_STORIES_TOKEN`, `TRAVEL_HTML_STORIES_TOKEN`
each falling back to it. So footshorts, vizf1, viznba and travel only work for a
signed-in app if their tokens are set on the vizmaya-fyi project, or the sites share
one value.

**Token callers** send the vizmaya-fyi publish token as `Authorization: Bearer <token>`,
and `x-footshorts-token`, `x-vizf1-token`, `x-viznba-token` or `x-travel-token` for the
other sites (each falls back to the bearer). The endpoint forwards the caller's token
to the site, which checks it, so a wrong one gets the site's 401. An OAuth access token
is never forwarded to a site, and the deployment's own tokens are only used for a
verified sign-in.

| Env on vizmaya-fyi | Needed for | Default |
|--------------------|------------|---------|
| `ADMIN_SESSION_SECRET` | the sign-in (must match admin's; both already have it) | — (without it the sign-in answers 503; token callers and `/public` still work) |
| `NEXT_PUBLIC_ADMIN_URL` | where the consent page is | `https://vismay.xyz` |
| `MCP_TOKEN_GENERATION` | signing every app out | `1` |
| the publish tokens above | what a signed-in app can publish to | — |

### Debugging a connection

Every sign-in step and MCP request writes one line to the vizmaya-fyi logs
([`src/log.ts`](src/log.ts)): Vercel → vizmaya-fyi → **Logs**, search `[mcp]`.

```
[mcp] {"event":"oauth.token","outcome":"refused","reason":"pkce_verifier_mismatch","from":"anthropic",...}
```

A healthy first connect reads, in order:
1. `mcp.request` refused with `no_credentials`: the 401 that starts the sign-in.
2. `oauth.register` ok, `oauth.authorize` ok, `oauth.callback` ok, `oauth.token` ok.
3. `mcp.request` ok for `initialize`, `notifications/initialized` and `tools/list`.

The last line before it stops is where it broke, and `reason` names the check that
failed (`hint` adds the likely fix where there is one). Other fields: `from`
(`anthropic` when the request came from Claude's servers, 160.79.104.0/21), `client`,
`redirect` (host only), `rpc` and `tool` (JSON-RPC methods and the tool called),
`clientInfo` and `requestedProtocol` on `initialize`, `caller` (`signed-in`, `tokens`,
`anonymous`), `status`, `ms`, and the transport's `error` when it rejects a request.
If the trail stops after `oauth.callback`, Claude's servers never reached the token
endpoint; if there are no `[mcp]` lines at all, requests aren't reaching the app (check
the connector URL and the Vercel Firewall). Tokens, codes, client ids, secrets,
publish tokens, tool arguments and IP addresses are never logged; the tests check it.

Checks: `pnpm --filter @vismay/mcp test` ([src/oauth.test.ts](src/oauth.test.ts),
[src/hosted.test.ts](src/hosted.test.ts)) and
`pnpm exec tsx packages/admin-core/src/mcpConsent.smoke.ts`.

## Notes

- On stdio, nothing may write to stdout except MCP frames — all diagnostics go to
  `stderr`, and `render_story_video` captures the child process output rather than
  inheriting it.
- The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — keep this server local/trusted.
- Config travels to the embed route as a base64url JSON query param; fine for
  typical configs. Very large configs would need a POST-and-token scheme (future).
