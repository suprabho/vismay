# @vismay/eval-entities

End-to-end LLM-as-judge evaluation for entity tagging. Works across any app
that ingests articles and tags them with canonical entities.

## What it measures

For a sample of already-tagged articles, asks a stronger Gemini model:

- **CORRECT** — tagged entities that are genuinely about-subject.
- **SPURIOUS** — tags that shouldn't be there (hallucinations, weak mentions, wrong canonical mapping).
- **MISSING** — entities the article IS about that weren't tagged.

Produces precision / recall / F1 overall, per entity type, and per publisher,
plus an HTML report with article-level breakdowns sorted worst-first.

Both extraction failures (Gemini missed/hallucinated) and resolution failures
(alias gap, wrong canonical) surface here, because both ultimately show up as
spurious or missing in the final tagged set.

## How to add an app

1. Implement an `EntityEvalAdapter` (see `src/types.ts`) that knows how to
   pull a sample of summarised articles + their currently-tagged entities
   from your app's DB.
2. Add a thin runner that imports `runEval` + your adapter and a script in
   your worker's `package.json`.

See `apps/vizf1/worker/src/eval/` and `apps/footshort/worker/src/eval/` for
the two existing implementations.

## Running

```bash
# from a worker with .env containing GEMINI_API_KEY + Supabase creds:
pnpm --filter @vizf1/worker eval
pnpm --filter @shortfoot/worker eval
```

Env knobs (all optional):

| Var | Default | What |
|---|---|---|
| `EVAL_SINCE` | `2026-05-01T00:00:00Z` | Earliest `summary_at` to sample from |
| `EVAL_MAX` | `100` | Sample cap |
| `EVAL_CONCURRENCY` | `10` | Parallel judge calls |
| `EVAL_JUDGE_MODEL` | `gemini-3.1-pro-preview` | Override the judge — any `@google/genai` model. Stable alternative: `gemini-2.5-pro`. |
| `EVAL_OUTPUT_DIR` | repo root | Where the HTML + JSON land |

## Methodological caveats

- Judge is Gemini Pro, same family as the extractor — not a fully independent
  judge. Good for trends + obvious regressions; layer a hand-labeled golden
  set on top for CI gating.
- Sample is a recency tail, not stratified by publisher/category. Skew bias
  toward whoever publishes most.
- The body shown to the judge is whatever the adapter returns (typically the
  Gemini summary, falling back to RSS snippet). The judge does NOT see the
  full original article — same constraint the extractor operated under, so
  this is intentional.
