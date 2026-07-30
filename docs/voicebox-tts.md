# Voicebox TTS — deployment + operations runbook

Story narration TTS can run against a self-hosted
[voicebox](https://github.com/jamiepine/voicebox) server instead of Gemini:
no daily quota, no per-request rate limit, one consistent voice, MIT license.
The provider seam lives in
[`packages/content-source/src/storyTtsProvider.ts`](../packages/content-source/src/storyTtsProvider.ts);
`generateStoryAudio` selects the provider per run via `TTS_PROVIDER`
(**default: `gemini`** until the cutover below).

Deliberate non-goal: TTS does NOT route through `@vismay/ai-gateway` — the
gateway wraps the hosted Vercel AI Gateway, which cannot reach a self-hosted
audio server, and its audit model is text/image-shaped.

## Rollout state

- [x] Phase 1 — provider seam merged (voicebox opt-in via env, Gemini default)
- [ ] Phase 0 — API contract verification + voice sign-off (checklist below)
- [ ] Phase 2 — Fly app deployed and checkpointed
- [ ] Phase 3 — cutover: `TTS_PROVIDER=voicebox` default + backfill

(Phase 1 landed before Phase 0 on purpose: the seam is inert without
`TTS_PROVIDER=voicebox`, and having it merged makes the spike easy to run
against real stories.)

## Architecture

```
generate-audio.ts ──POST /generate──▶ Caddy :8080 ──▶ uvicorn 127.0.0.1:17493
 (GHA or local)  ◀─GET /audio/{id}──  (bearer token)      (voicebox, CPU)
        │                                                    │
        ▼                                              Fly volume /app/data
 normalize → WAV mono/24kHz/16-bit → Supabase `story-audio`   (profiles DB +
        + story_audio_chunks / story_audio_cues                HF model cache)
```

- Voicebox's API is two-step: `POST /generate` returns JSON with a generation
  `id`; the audio file comes from `GET /audio/{id}`. `GET /health` reports
  `model_loaded` and is the only unauthenticated route.
- Voicebox has **no auth** — the Caddy sidecar (see
  [`infra/voicebox/`](../infra/voicebox/)) enforces
  `Authorization: Bearer <token>` on everything except `GET /health`.
  Never expose port 17493 directly.
- Every stored chunk is normalized to mono/24 kHz/16-bit PCM WAV
  (`normalizeWav`) so the video render's `-c copy` concat stays valid even
  for stories mixing Gemini- and voicebox-era chunks.
- The chunk cache hash includes `provider:voice`, so switching provider or
  profile invalidates every chunk — a plain (non-force) run then fully
  re-voices a story. No half-and-half stories.

## Phase 0 checklist — REQUIRED before cutover

Run against a local instance (`git clone jamiepine/voicebox && docker compose
up`; host port **17600** → container 17493), then repeat the API items against
the deployed Fly app. The shipped openapi.json is stale (v0.1.0) — the live
`/docs` (FastAPI swagger) of the pinned SHA is the source of truth.

- [ ] `GET /profiles` — how preset voices appear; confirm a preset id works
      directly as `profile_id` in `/generate` (or create a profile first).
      Record the chosen `profile_id` here: `____________`
- [ ] `POST /generate` + `GET /audio/{id}` — `ffprobe` the downloaded file:
      container, codec, sample rate, channels. (Anything non-canonical is
      handled by `normalizeWav`, but know what we're normalizing.)
- [ ] `/generate` behavior while the model is still loading (`model_loaded:
      false`) — confirm `waitForVoiceboxReady` covers it.
- [ ] CPU realtime factor on a real ~250-word chunk (drives sizing + the Fly
      proxy-timeout question). Record: `____ s audio / ____ s wall-clock`
- [ ] Behavior near the 5000-char request limit (`CHUNK_WORD_TARGET=500` runs
      get close; the client hard-fails chunks over 4800 chars).
- [ ] Voice bake-off: generate one full real story through 2–3 candidate
      voices/engines; compare against the current Gemini "Orus" narration.
- [ ] `POST /transcribe` — does the pinned build return word-level timestamps?
      (Spec says no → whisper.cpp alignment stays.)

## One-time Fly setup

```bash
fly apps create vismay-voicebox
fly volumes create voicebox_data --size 20 -r iad -a vismay-voicebox
fly secrets set VOICEBOX_PROXY_TOKEN="$(openssl rand -hex 32)" -a vismay-voicebox
fly tokens create deploy -a vismay-voicebox   # → GHA secret FLY_DEPLOY_TOKEN
```

Then run the **Deploy voicebox TTS server** workflow (or push a change under
`infra/voicebox/**`). After first boot, create/confirm the voice profile and
record its `profile_id`.

**The profile is pet state on the volume.** Export/back it up (voicebox has
profile import/export) and enable Fly volume snapshots — losing it silently
changes the narration voice and invalidates every chunk hash.

### Verifying a deploy (Phase 2 checkpoint)

```bash
# unauthenticated health — must work (Fly checks depend on it)
curl https://vismay-voicebox.fly.dev/health
# without token — must be 401
curl -i -X POST https://vismay-voicebox.fly.dev/generate -d '{}'
# with token — must generate; then fetch /audio/{id}
curl -X POST https://vismay-voicebox.fly.dev/generate \
  -H "Authorization: Bearer $VOICEBOX_TOKEN" -H 'Content-Type: application/json' \
  -d '{"text":"Checkpoint.","profile_id":"<id>","language":"en"}'
```

Also verify: suspend→wake (first generate after 30+ min idle succeeds within
`waitForVoiceboxReady`'s 3-min budget) and that the **longest real chunk**
completes without hitting Fly's ~60 s proxy idle timeout. If it does time out,
the retrofit is to poll `GET /history/{id}` after the POST instead of holding
the connection — the two-step API makes this cheap.

## Environment variables

| Name | Where | Notes |
|---|---|---|
| `TTS_PROVIDER` | GHA repo **variable**, local `.env` | `voicebox \| gemini`; the rollback lever. Unset = `gemini` (flips at cutover) |
| `VOICEBOX_URL` | GHA secret, `.env` | `https://vismay-voicebox.fly.dev` (local: `http://127.0.0.1:17600`) |
| `VOICEBOX_PROFILE_ID` | GHA secret, `.env` | voice profile from `GET /profiles` |
| `VOICEBOX_TOKEN` | GHA secret | bearer token; must equal the Fly secret |
| `VOICEBOX_PROXY_TOKEN` | Fly secret | same value, checked by Caddy |
| `VOICEBOX_TIMEOUT_MS` | optional | per-request timeout (default 300000) |
| `GEMINI_API_KEY` | unchanged | required only when provider = gemini |

## Cutover (Phase 3)

1. Phase 0 checklist complete; Phase 2 checkpoint green.
2. Add `VOICEBOX_URL` / `VOICEBOX_TOKEN` / `VOICEBOX_PROFILE_ID` to the
   `Production` environment secrets; set repo **variable**
   `TTS_PROVIDER=voicebox` (render-audio.yml reads it).
3. Flip the code default in `resolveTtsProvider`
   (`storyTtsProvider.ts`) from `gemini` to `voicebox` and update
   `apps/vizmaya-fyi/CLAUDE.md`.
4. **Backfill:** loop every slug through `generate-audio.ts` *without*
   `--force` — the provider-aware hash regenerates exactly the stale chunks.
   Rerun until every story reports `0 failed` (failures self-heal on rerun).
   Spot-listen 3 stories; re-render narrated videos for stories whose MP4s
   matter (existing videos keep the old voice until re-rendered).

## Rollback / voicebox down

- **Instant:** set repo variable `TTS_PROVIDER=gemini` and re-dispatch — the
  Gemini path is untouched and the hash mechanism re-voices cleanly.
- There is deliberately **no silent auto-fallback** to Gemini when voicebox
  is down — that would reintroduce mixed-voice stories. A down server fails
  fast in `waitForVoiceboxReady`; the GHA run goes red; DB rows are untouched.
- Playback and video renders read Supabase, never voicebox — stopping the Fly
  app breaks nothing already generated.

## Upgrading voicebox

1. Bump `VOICEBOX_REF` in `.github/workflows/build-voicebox-image.yml`.
2. Deploy; re-run the Phase 0 **API contract** items against the new build
   (the two-step generate flow, health shape, and profile ids must survive).
3. Spot-generate one story before letting production renders through.
