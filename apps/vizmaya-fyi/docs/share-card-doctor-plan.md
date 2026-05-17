# Share Card Doctor — Plan

A Claude Code subagent that diagnoses and fixes layout bugs in share-page cards
(`/story/[slug]/share`). Triggered when the user shows screenshots or says "fix
share cards", "text is clipping", "cards look broken", etc.

## Why a subagent (not a skill)

- The fix loop is multi-step: read 5+ components → start preview → screenshot
  each ratio (1:1, 3:4, 4:3) → diagnose → edit → re-screenshot → repeat.
- Wants an isolated context window. Screenshots and Mapbox logs are noisy; we
  don't want them polluting the parent session.
- Has a stable tool subset: Read, Edit, Grep, Glob, Bash, and the
  `mcp__Claude_Preview__preview_*` family. No need for agent spawning.

A small skill could be added later to normalize the trigger phrasing, but the
subagent does the actual work.

## Scope of bugs it handles

From the screenshots + exploration pass:

| # | Bug | Root cause | File |
|---|-----|------------|------|
| 1 | Body text overflows bottom of card (`"recession scare or a commodity"` cut) | `PretextBlock` has no height clamp; `ShareTextCard` uses `justify-center` on overflowing content | [components/share/ShareTextCard.tsx:22](components/share/ShareTextCard.tsx:22), [components/share/PretextBlock.tsx](components/share/PretextBlock.tsx) |
| 2 | Branding header stacks over section eyebrow (`"MARKETS"` clipped above `"THE YEAR THE DOLLAR LOST"`) | `BrandingHeader` absolute-positioned top-0 but card content also starts at top-0 when map-title or text variant pushes up | [components/share/ShareCard.tsx:310](components/share/ShareCard.tsx:310), [components/share/BrandingFooter.tsx](components/share/BrandingFooter.tsx) |
| 3 | Eyebrow gets clipped (`"197"` instead of `"1976"`) | Branding header covers section eyebrow; no top padding on inner content to clear the header band | [components/share/ShareCard.tsx:229](components/share/ShareCard.tsx:229) |
| 4 | Map labels/pins extend past card bounds | `ShareMapBg` renders Mapbox popups without card-viewport clamp | [components/share/ShareMapBg.tsx:68](components/share/ShareMapBg.tsx:68) |
| 5 | Chart+text composite overflows | `min-h-0` on chart flex child is correct, but `line-clamp-3` alone doesn't guarantee height fit at 4:3 | [components/share/ShareCard.tsx:265](components/share/ShareCard.tsx:265) |

## What the agent does (run order)

1. **Discover cards to audit.** Read current story list (`content/` or DB), pick
   the story slug from user input or default to the one in the screenshot.
2. **Start preview** via `preview_start` pointing at
   `/story/{slug}/share`.
3. **Snapshot the cards** at each ratio. Use `preview_eval` to click the ratio
   toggle, then `preview_screenshot` each card container.
4. **Diagnose**. For each screenshot, the agent describes the failure mode in
   one sentence and maps it to the bug table above. If it doesn't match, it
   reports "unknown" rather than guessing.
5. **Fix one bug at a time.** Edits the file, triggers HMR, re-screenshots the
   affected card only. Loop until clean or budget exhausted (max 5 iterations
   per card).
6. **Report.** Returns a punch list: `<file:line> changed — fixed bug #N — before/after thumbnails`.

## Guardrails

- **Never edits `ShareShell.tsx` layout orchestration** without explicit user
  approval — it controls bulk download and ratio state.
- **Never changes `RENDER_SIZE`/`OUTPUT_SIZE` constants** — those are the
  IG/Twitter export targets.
- **Verifies every edit visually.** A type check passing is not enough.
- **No new dependencies.** All fixes use existing Tailwind + CSS.

## Files to create

```
.claude/agents/share-card-doctor.md          # subagent definition
docs/share-card-doctor-plan.md               # this file (keep for reference)
```

Optional (later):

```
.claude/skills/fix-share-cards/SKILL.md      # thin trigger skill
```

## Subagent frontmatter (draft)

```yaml
---
name: share-card-doctor
description: Diagnose and fix visual bugs in share-page cards (text clipping, header stacking, map label overflow). Use when the user shows share card screenshots with layout issues or says "fix share cards".
tools: Read, Edit, Grep, Glob, Bash, mcp__Claude_Preview__preview_start, mcp__Claude_Preview__preview_screenshot, mcp__Claude_Preview__preview_click, mcp__Claude_Preview__preview_eval, mcp__Claude_Preview__preview_snapshot, mcp__Claude_Preview__preview_console_logs, mcp__Claude_Preview__preview_logs
model: sonnet
---
```

Sonnet is the right default: the task is visual diagnosis + targeted edits,
not deep architecture. Upgrade to opus only if the agent reports low confidence
three times in a row.

## Open questions before building

1. Should the agent **auto-commit** its fixes per bug, or batch into one commit
   at the end? (Default: one commit per fix, easier to revert.)
2. Do we want the agent to seed **snapshot fixtures** under `docs/share-cards/`
   so regressions are caught in CI later? (Out of scope for v1.)
3. Is there a canonical story slug with all variant types (text / hero / stat /
   chart / map-title) the agent should always audit, to catch cross-variant
   regressions? If yes, bake that into the agent prompt.

## Next steps

Once you confirm the subagent route, I'll:
1. Write `.claude/agents/share-card-doctor.md` with the full system prompt.
2. Run it against the story in the screenshots to verify end-to-end.
3. Commit on this branch and open a PR.
