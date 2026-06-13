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

## Environment

| Var | Needed by | Default |
|-----|-----------|---------|
| `CATALOG_BASE_URL` | embed_url, render_module_image | `http://localhost:3100` |
| `VIZMAYA_BASE_URL` | render_story_video | `http://localhost:3000` |
| `NEXT_PUBLIC_SUPABASE_URL` | render_story_video | — (required) |
| `SUPABASE_SERVICE_ROLE_KEY` | render_story_video | — (required) |
| `SCREENSHOT_DIR` | render_module_image (`returnAs:'path'`) | `/tmp/vismay-mcp-screenshots` |
| `VISMAY_REPO_ROOT` | render_story_video | auto-derived |

The metadata tools (`list_verticals` / `list_modules`) need none of these.

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

Transport is **stdio**. A Streamable HTTP transport (for remote/multi-client use,
mirroring HeyGen's hosted MCP) is a planned follow-up.

## Notes

- On stdio, nothing may write to stdout except MCP frames — all diagnostics go to
  `stderr`, and `render_story_video` captures the child process output rather than
  inheriting it.
- The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — keep this server local/trusted.
- Config travels to the embed route as a base64url JSON query param; fine for
  typical configs. Very large configs would need a POST-and-token scheme (future).
