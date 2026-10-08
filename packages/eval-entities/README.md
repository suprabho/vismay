# @vismay/eval-entities

End-to-end LLM-as-judge evaluation for entity tagging. Works across any app
that ingests articles and tags them with canonical entities.

## What it measures

For a sample of already-tagged articles, grades every tag and looks for gaps:

- **CORRECT** — tagged entities that are genuinely about-subject.
- **SPURIOUS** — tags that shouldn't be there (hallucinations, weak mentions, wrong canonical mapping, wrong type).
- **MISSING** — entities the article IS about that weren't tagged.

CORRECT / SPURIOUS are per-tag decisions, so they go to Jev (`decide()` from
`@vismay/ai-gateway`, `typesafe-ai/jev`): one `choice` question per tag,
batched ≤24 per request. MISSING (plus a one-line note) is free-form, so it
goes to a Claude text model — `text.opus` by default — which sees Jev's
verdicts so it doesn't re-list tagged entities.

Produces precision / recall / F1 overall, per entity type, and per publisher,
plus an HTML report with article-level breakdowns sorted worst-first.

Both extraction failures (the extractor missed/hallucinated) and resolution failures
(alias gap, wrong canonical) surface here, because both ultimately show up as
spurious or missing in the final tagged set.

## How to add an app

1. Implement an `EntityEvalAdapter` (see `src/types.ts`) that knows how to
   pull a sample of summarised articles + their currently-tagged entities
   from your app's DB.
2. Add a thin runner that imports `runEval` + your adapter and a script in
   your worker's `package.json`.

See `apps/vizf1/worker/src/eval/` and `apps/footshorts/worker/src/eval/` for
the two existing implementations.

## Running

```bash
# from a worker with .env containing AI_GATEWAY_API_KEY + Supabase creds:
pnpm --filter @vizf1/worker eval
pnpm --filter @footshorts/worker eval
```

Env knobs (all optional):

| Var | Default | What |
|---|---|---|
| `EVAL_SINCE` | `2026-05-01T00:00:00Z` | Earliest `summary_at` to sample from |
| `EVAL_MAX` | `100` | Sample cap |
| `EVAL_CONCURRENCY` | `10` | Parallel judge calls |
| `EVAL_JUDGE_MODEL` | `text.opus` | Text model that lists MISSING entities — an `@vismay/ai-gateway` alias (`text.sonnet`, …) or a raw gateway id. |
| `JEV_MODEL` | `typesafe-ai/jev` | Decision model for the per-tag CORRECT / SPURIOUS verdicts. |
| `EVAL_OUTPUT_DIR` | repo root | Where the HTML + JSON land |

## Methodological caveats

- Judge is Jev + Claude Opus; the extractor is Claude Haiku (with a Jev
  precision gate on footshorts), so not a fully independent judge. Good for
  trends + obvious regressions; layer a hand-labeled golden set on top for CI
  gating.
- Sample is a recency tail, not stratified by publisher/category. Skew bias
  toward whoever publishes most.
- The body shown to the judge is whatever the adapter returns (typically the
  stored summary, falling back to RSS snippet). The judge does NOT see the
  full original article — same constraint the extractor operated under, so
  this is intentional.
