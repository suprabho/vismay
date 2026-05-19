# Greenmentor on Vismay — Phased Build Plan

**Status:** Draft v0.1 · 2026-05-20
**Owner:** Supro
**Inputs:** `Greenmentor AI Vision.pdf` · `vismay/` (current stack) · `flp-monorepo/` (reference backend)

---

## TL;DR

Greenmentor is a B2B "AI Operating System for ESG" — agentic workflows that automate sustainability work, not another dashboard. The vision PDF defines 5 priority workflows on top of two platform layers (Core Infrastructure + AI Agents) with a Human-in-the-Loop operating model, rolled out across three phases (Internal AI → Assisted Enterprise → Modular Platform).

Vismay today is a consumer storytelling engine — Next.js 16 + Supabase + a viz-engine for scrollytelling, with mature pipelines for PDF/video/audio rendering and document ingestion. ~30–40% of the chassis we need for Greenmentor's *Core Infrastructure* layer (Layer 1) is already on the floor. The *Agent* layer (Layer 2) and the multi-tenant operational primitives are net-new.

The cleanest shape is to add Greenmentor as a **new app inside the vismay monorepo** (`apps/greenmentor`) backed by a **new Python agent service** (`apps/greenmentor-agents`) lifted from the flp-monorepo `api-server` pattern. Supabase becomes the system of record; the agent service handles tool-calling, document parsing, and long-running workflows.

The first 12 weeks deliver Phase 1 ("Internal AI") for Greenmentor's own consulting team across two of the five priority workflows — Utility Bill Extraction (easiest, fastest win) and Scope 3 Procurement Classification (biggest pain point). Everything else flows from those two foundations.

---

## 1. What the vision actually asks for

### Layer 1 — Core Infrastructure (system of record)
Six primitives that every workflow depends on:

| Primitive | What it is | Notes |
|---|---|---|
| Emissions DB | Master library of emission factors (IPCC, DEFRA, India GHG Program, IEA, ecoinvent) plus an organisation's calculated emissions | Read-heavy reference + write-heavy results store |
| Entity Mgmt | Companies, sites/facilities, departments, suppliers, products, periods | Multi-tenant from day one |
| Audit Trails | Immutable log of "who/what/when/which AI/which prompt" for every value that ends up in a disclosure | Compliance-grade — append-only |
| Reporting Engine | BRSR, GRI, CDP, TCFD, IFRS S1/S2 outputs from collected data | Template-driven; the vismay PDF pipeline is the closest analogue we already have |
| Framework Maps | Crosswalks between frameworks (e.g. BRSR §III A → GRI 305 → CDP C6) | A graph, not a table |
| Workflow Orchestration | Tasks, assignments, deadlines, "waiting on X dept", reminders, evidence collection state | This is where "remove the email chase" lives |

### Layer 2 — AI Agents (15 named agents across 5 domains)
Carbon (Utility Bill AI, Scope 3 Map, Refrigerant AI) · Reporting (BRSR Copilot, Report Drafter, Framework Map) · Supply Chain (Supplier ESG, Cert Monitor, Risk Scorer) · Consulting (Materiality AI, Policy Gaps, Gap Detector) · Governance (Meeting Bot, Board Brief, Action Track).

### The 5 priority workflows (proof points)
1. **Scope 3 Procurement Classification** — Maps spend descriptions → emission factors. *Biggest pain point.*
2. **Utility Bill Emissions Extraction** — Reads invoices → units → facility → Scope 2 emissions. *Highest automation fit.*
3. **BRSR Evidence Collection** — Coordinates cross-functional data gather. *Highest frequency.*
4. **Sustainability Report Drafting** — First-pass drafts with peer benchmarking. *Quick win for consulting team.*
5. **Supplier ESG Assessment** — Reads questionnaires, scores maturity, flags weak responses. *Growing demand.*

### Operating model
`Data In → AI Draft → Human Review → Validated Output`. Every agent output is a *draft* until a human approves; the audit trail records the journey.

### Phases (PDF roadmap)
- **Phase 1 — Internal AI:** Build for Greenmentor's own consulting ops.
- **Phase 2 — Assisted Enterprise:** Human + AI deployment with paying clients.
- **Phase 3 — Modular Platform:** Self-serve SaaS with an agent marketplace.

---

## 2. What vismay already gives us (and what it doesn't)

### Reusable as-is

| Asset in vismay | Where | Reuse for Greenmentor |
|---|---|---|
| Turborepo + pnpm workspaces | `pnpm-workspace.yaml`, `turbo.json` | Add `apps/greenmentor` and Greenmentor-specific packages without touching siblings |
| Supabase Postgres + storage + RLS | `apps/vizmaya-fyi/supabase/migrations/` (41 migrations, well-disciplined naming) | Becomes the system-of-record DB. Already wired for service-role + anon split. |
| Anthropic + Gemini SDKs already in deps | `apps/vizmaya-fyi/package.json` (`@anthropic-ai/sdk`, `@google/genai`) | LLM access from Next.js for cheap one-shots |
| PDF render pipeline (Playwright + dispatch) | `lib/storyPdfRender.ts`, `lib/storyPdfDispatch.ts`, `.github/workflows/render-pdf.yml` | **Direct fit for the Reporting Engine** — BRSR PDF, exec summary PDF, board briefs |
| Video/audio render pipeline (same dispatch pattern) | `lib/storyVideoRender.ts`, `lib/storyAudioDispatch.ts` | Later — exec narrations, training videos |
| `gray-matter` + `yaml` content pipeline | `lib/content.ts`, `lib/storyConfig.ts` | Adapt for framework template definitions (BRSR sections, GRI indicators) |
| Admin shell (login, tabs, form schema, auth middleware) | `packages/admin-core`, `packages/viz-admin` | Starting point for Greenmentor's internal console — needs an auth upgrade, see gaps |
| PDF parsing (`pdf-parse`) + scraping (`playwright`, `jsdom`, `@mozilla/readability`) | Already in `vizmaya-fyi` devDeps | Direct fit for utility-bill ingestion (light pass) and supplier-doc reads |
| Email ingestion endpoint | `app/api/ingest/email/route.ts` + `lib/socialEmailParse.ts` | Pattern for "forward your utility bill to bills@…" capture |
| `ingest-source.ts` scaffolding | `scripts/ingest-source.ts` | Pattern for one-shot ingestion jobs (emission factors, supplier lists) |
| Mapbox/Deck.gl | `apps/vizmaya-fyi` deps | Facility maps, supply-chain geography |
| ECharts + chart-data API route | `app/api/chart-data/[slug]/[id]/route.ts` | Internal dashboards (emissions trend, supplier scorecards) |
| GitHub Actions dispatch-to-runner pattern | `lib/storyPdfDispatch.ts`, `.github/workflows/render-pdf.yml` | The "no dedicated worker" trick for batch jobs (bulk classify Scope 3 spend lines) |
| Tailwind v4 + shadcn + Phosphor | preferences + `components.json` | UI is consistent with user's stated stack preference |

### Gaps to fill (net-new)

| Gap | Why it matters | Strategy |
|---|---|---|
| **Multi-tenant data model** | Vismay assumes one Supabase per app (no org/workspace concept). Greenmentor needs orgs × users × roles. | New `organizations`, `org_members`, `roles` tables. RLS by `org_id` on every operational table. |
| **Real auth (not admin password)** | `admin-core/src/auth.ts` is single-password. Greenmentor needs SSO + MFA + audit-grade login logs. | Supabase Auth + Google/Microsoft SSO + row-level policies. Eventually SAML for enterprise. |
| **Long-running agent runtime** | Vercel/Next.js routes time out at 60s (Pro: 300s). Scope 3 classification on 10k spend lines won't fit. | Lift the FLP api-server pattern: a Python FastAPI service (LiteLLM + DSPy) on Fly.io / Railway / Fargate handling agent runs. |
| **Tool-calling agent framework** | No agent loop in vismay today. | Adopt the FLP `services/tools/` pattern — one Python module per tool, registered into a TOOL_FUNCTIONS dict. Start with: `lookup_emission_factor`, `classify_spend_line`, `extract_utility_bill`, `fetch_facility`, `write_to_audit_log`. |
| **Document AI / OCR** | Utility bills are scanned PDFs; `pdf-parse` doesn't OCR. | Google Document AI (already in FLP via `google-cloud-discoveryengine` + `google-cloud-aiplatform`) **or** Anthropic file-input. Start with Anthropic to keep the surface small. |
| **Vector search over framework docs** | BRSR has ~1100 disclosure questions across 9 sections; Report Drafter needs grounded retrieval. | Vertex AI Search (per FLP), or `pgvector` on the existing Supabase — strongly prefer pgvector to avoid a new infra dependency. |
| **Workflow orchestration (tasks/assignments)** | "Remove the email chase" requires durable tasks, assignees, deadlines, reminders. | New `workflow_tasks`, `workflow_steps`, `assignments` tables. Notification fan-out via Supabase pg_cron + a thin Resend/Postmark integration. |
| **Audit trail (immutable)** | Disclosures must be defensible. | Append-only `audit_events` table with hash chaining (`prev_hash`, `payload_hash`). RLS denies UPDATE/DELETE. |
| **Emission factor database** | The PDF lists "Emissions DB" as a Layer 1 primitive. | Seed from EPA eGRID + India CEA + DEFRA + IEA. Schema: `(factor_id, source, scope, category, region, year, unit_in, unit_out, kg_co2e_per_unit, valid_from, valid_to)`. |
| **Framework crosswalks** | "Framework Maps" primitive. | A graph table: `(source_framework, source_id, target_framework, target_id, mapping_type, confidence)`. Seed with BRSR↔GRI↔CDP. |
| **Observability for LLM calls** | Need to debug agent decisions, costs, hallucinations. | Langfuse (already pinned in FLP `pyproject.toml`). |
| **LongSight integration** | The PDF says "System of record already exists" (LongSight). Need read access at minimum. | Out of scope until we see what LongSight exposes (API? DB? exports?). Mark as a Phase-2 dependency to resolve. |
| **Consultant-facing internal app** | Phase 1 user is Greenmentor's own consulting team. | New `apps/greenmentor` Next.js app — does *not* reuse the vizmaya marketing surface. |

### Things in vismay we deliberately don't carry over
Story/scrollytelling primitives (`viz-engine/foregroundLayouts`, `StoryShellContext`, `ForegroundLayoutSlot`), Rive animations, social-card generation, demo-client login flow, F1/football verticals — these belong to the consumer-IP side of the studio and are noise for Greenmentor.

---

## 3. Patterns to lift from flp-monorepo

The FLP backend is the closest reference we have to what Greenmentor's agent service needs. Specific things to copy structurally:

| FLP file/pattern | What it does | How we adapt |
|---|---|---|
| `resources/api-server/` | FastAPI + LiteLLM + Mangum, controller/service/route layering | Become `apps/greenmentor-agents/`. Same layering. Swap DynamoDB for Supabase (Postgres). |
| `services/tools/__init__.py` | Single registry exporting `tool_def` + `tool_fn` pairs | Same export contract; each Greenmentor agent (Utility Bill AI, Scope 3 Map…) is a composition of tools, not a monolith |
| `services/tools/file_search_vertex.py` | Vertex AI Search wrapper with extractive segments + struct data | Replace with `pgvector_search` against framework/factor embeddings in Supabase |
| `services/llm_service.py` | LiteLLM stream + tool-call routing + Langfuse `@observe` | Lift verbatim. Adds multi-provider switching (Claude for reasoning, Gemini for cheap classification) |
| `services/chat_service.py` + `models/chat.py` | Persistent chat sessions, message replay | Adapt to "agent runs" — a `run` has a goal, steps, and a final validated output |
| `dynamo_db/async_mixin.py` | Async ORM mixin | Skip — Supabase client is async-native |
| `infra/lib/fargate-stack.ts` (CDK) | ALB → Fargate → DynamoDB stack | Reference only — for Phase 1 we host on Fly.io or Railway to avoid CDK overhead |
| `resources/ingestion/ingest_excel.py` | Excel → JSON → DB pipeline with Drive auth | Direct lift for ingesting emission-factor sheets and supplier rosters |
| `resources/prompts/` + `run_*_tests.sh` | Prompt regression harness (citation, hallucination, IP, out-of-bounds) | Adopt before we ship anything client-facing. Critical for compliance-grade outputs. |
| `langfuse` + `@observe` decorators | LLM tracing | Adopt from day one — debugging agent decisions without traces is suicide |

Patterns to **not** copy: DynamoDB (use Supabase Postgres), AWS CDK in Phase 1 (use Fly.io until we need VPC peering), Mangum/Lambda packaging (we want long-running connections).

---

## 4. Target architecture

```
┌─────────────────────────────────────────────────────────────┐
│  apps/greenmentor (Next.js 16, Tailwind v4, shadcn, Phosphor)│
│  Internal consultant console — Phase 1                       │
│  ─ /dashboard  /workflows/[id]  /entities  /reports          │
│  ─ /admin (org, members, settings) — extends admin-core      │
└────────────┬────────────────────────────┬───────────────────┘
             │ Supabase JS (auth + reads) │ fetch /api → forward
             ▼                            ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│ Supabase (Postgres)      │   │ apps/greenmentor-agents     │
│ ─ organizations          │   │ FastAPI + LiteLLM + DSPy    │
│ ─ org_members + roles    │◀──│ ─ /runs (start, stream, poll)│
│ ─ entities (sites, depts)│   │ ─ tool registry             │
│ ─ suppliers              │   │ ─ Langfuse traces           │
│ ─ emission_factors (seed)│   │ Host: Fly.io (Phase 1)      │
│ ─ measurements (results) │   └────────┬────────────────────┘
│ ─ workflow_tasks         │            │ tools call back ↓
│ ─ audit_events (append)  │◀───────────┘ (service-role JWT)
│ ─ framework_maps         │
│ ─ doc_embeddings (vector)│
│ Storage: utility-bills/, │
│   supplier-docs/, reports│
└──────────────────────────┘
             ▲
             │ batch ingest
┌────────────┴─────────────┐
│ packages/gm-ingestion    │   GitHub Actions workers
│ ─ emission factor seed   │◀──(dispatch pattern from vismay)
│ ─ utility bill OCR       │
│ ─ supplier doc parse     │
└──────────────────────────┘
```

Three deployable units. The Next.js app is the only thing users touch. The Python service is invoked from Next.js API routes. Batch jobs run on GitHub Actions for elasticity (same pattern vismay already uses for PDF/video rendering).

---

## 5. Phased plan

Phase 1 maps to the PDF's "Internal AI" phase, Phase 2 to "Assisted Enterprise", Phase 3 to "Modular Platform". Inside each, the work is grouped Foundation → Workflows → Polish.

### Phase 1 — Internal AI (12 weeks, ~1–2 engineers)

**Goal:** Greenmentor's own consulting team uses the platform end-to-end for two workflows on real client engagements. Generates the feedback loop the PDF calls out.

#### Phase 1.A — Foundation (Weeks 1–3)

| # | Task | Files / modules to touch | Effort | Notes |
|---|---|---|---|---|
| F1 | Scaffold `apps/greenmentor` Next.js 16 app | `apps/greenmentor/{app,components,lib,supabase}`, update `pnpm-workspace.yaml` (already globs `apps/*`) | S | Mirror `apps/vizmaya-fyi/` shape; add to `turbo.json` env if new vars |
| F2 | Scaffold `apps/greenmentor-agents` FastAPI service | New dir; copy `flp-monorepo/resources/api-server/{controllers,services,routes,core,models,middleware}` skeleton | M | Strip FLP domain logic — keep the LLM/tools/streaming chassis. Use `uv` like FLP. |
| F3 | New Supabase project + migrations 001–006 | `apps/greenmentor/supabase/migrations/` — `001_organizations`, `002_members_roles`, `003_entities`, `004_suppliers`, `005_audit_events`, `006_framework_maps` | M | Hash-chained audit table is the trickiest — write tests |
| F4 | Auth: Supabase Auth + Google SSO + org-scoped RLS helpers | `apps/greenmentor/lib/supabase.ts`, RLS policies in migration 002 | M | Drop the single-password admin from `packages/admin-core` — use Supabase Auth |
| F5 | Org provisioning flow (create org, invite members, assign role) | `apps/greenmentor/app/(admin)/org/*`, server actions | M | Roles: `owner`, `admin`, `analyst`, `reviewer`, `viewer` |
| F6 | Agent service ↔ Supabase service-role connector | `apps/greenmentor-agents/src/gm_agents/db/supabase.py` (new) | S | Service-role JWT, scoped to a verified `org_id` per request |
| F7 | Tool registry pattern (port from FLP) | `apps/greenmentor-agents/src/gm_agents/services/tools/{__init__,registry}.py` | S | First three stub tools: `lookup_emission_factor`, `write_measurement`, `log_audit_event` |
| F8 | Langfuse wiring + base `@observe` decorators | `apps/greenmentor-agents/src/gm_agents/utils/langfuse.py` (lift from FLP) | S | Free tier is fine for Phase 1 |
| F9 | Internal "run" model: `agent_runs`, `run_steps`, `run_outputs` tables + REST endpoints | migration `007_agent_runs`; `routes/runs.py` | M | SSE streaming endpoint mirroring `services/stream_service.py` in FLP |
| F10 | Emission factor DB seed (DEFRA + India CEA + IEA + EPA eGRID subset) | `packages/gm-ingestion/seed_emission_factors.py` + CSVs in `packages/gm-ingestion/data/` | M | Start small: electricity grid factors by Indian state + DEFRA UK + EPA US |
| F11 | Greenmentor brand pass on shared `packages/ui` | `packages/ui/src/{theme,tokens,logo}.tsx` | S | Reuse vismay's design tokens approach; Phosphor + Tailwind per preferences |
| F12 | CI: typecheck + lint + python `ruff` + `pytest` on PR | `.github/workflows/ci.yml` (extend existing) | S | Block merges on red |

**Phase 1.A exit criteria:** A consultant can log into Greenmentor with Google SSO, see their org, create a client entity with sites, and the agent service can read/write to Supabase with service-role auth + log an audit event. Nothing AI-flavoured yet — just the chassis.

#### Phase 1.B — Workflow #2: Utility Bill Emissions Extraction (Weeks 4–6)

*Chosen first because it's the highest automation fit per the PDF and gives the fastest visible win.*

| # | Task | Files / modules | Effort | Notes |
|---|---|---|---|---|
| U1 | Utility bill upload UI (drag/drop, batch, per-site tagging) | `apps/greenmentor/app/(workflows)/utility-bills/*` | M | Reuse Supabase storage pattern from vismay PDF pipeline |
| U2 | OCR + extraction tool: `extract_utility_bill` | `apps/greenmentor-agents/src/gm_agents/services/tools/extract_utility_bill.py` | L | Claude file-input first (one round-trip). Schema: `{provider, account, period_start, period_end, kWh, kVAh, demand_kW, total_amount, currency, address}` |
| U3 | Facility matching tool: `match_facility` | `tools/match_facility.py` | M | Fuzzy match extracted address ↔ `entities.sites`. Surfaces ambiguous matches for human review. |
| U4 | Scope 2 calculation tool: `calculate_scope2_emissions` | `tools/calculate_scope2.py` | S | `kWh × emission_factor(region, year)`. Records both location-based and market-based where data permits. |
| U5 | Agent orchestrator: `UtilityBillAgent` | `services/agents/utility_bill_agent.py` | M | LLM plan: extract → match → calculate → write measurement → emit human-review task |
| U6 | Human review UI (drafts → approve/edit/reject) | `apps/greenmentor/app/(workflows)/utility-bills/[id]/review` | M | Side-by-side: extracted JSON vs source PDF page. Phosphor `check`, `pencil`, `x` icons. |
| U7 | Audit log integration on every state change | reuse `log_audit_event` tool | S | "User X approved measurement Y; AI confidence 0.87; bill page 2" |
| U8 | Bulk export: validated Scope 2 measurements → CSV / Excel | `lib/export.ts` | S | Excel via the `xlsx` skill when we get there |
| U9 | Eval harness for the bill agent | `apps/greenmentor-agents/tests/test_utility_bill_agent.py` + 30 sample bills (Indian DISCOMs + a couple of UK/US) | M | Lift `run_*_tests.sh` pattern from `flp-monorepo/resources/prompts/` |

**Exit criteria:** Greenmentor's analyst uploads 50 utility bills for a real client, the agent drafts emissions for ≥80% within 5 minutes per batch of 10, reviewer approves with median <30s per bill, every approval ends up as an immutable audit event.

#### Phase 1.C — Workflow #1: Scope 3 Procurement Classification (Weeks 7–10)

*The PDF's "biggest pain point." Harder than utility bills because the input is a noisy spend ledger, not a structured doc.*

| # | Task | Files / modules | Effort | Notes |
|---|---|---|---|---|
| S1 | Spend ledger ingestion (Excel/CSV upload, column mapping wizard) | `apps/greenmentor/app/(workflows)/scope-3/import/*` | M | `papaparse` + `xlsx`. UI maps user columns → canonical schema (`description, vendor, amount, currency, gl_code?, date`). |
| S2 | Classification taxonomy: GHG Protocol Scope 3 category schema | migration `010_scope3_categories` + seed | S | 15 categories, each with default emission-factor approach (spend-based vs activity-based) |
| S3 | Vector embedding of emission factor library | migration `011_pgvector_embeddings` + `packages/gm-ingestion/embed_factors.py` | M | `pgvector` extension on Supabase. Embed factor description + category + region with Gemini text-embedding |
| S4 | Tool: `search_emission_factors` (pgvector + filters) | `tools/search_emission_factors.py` | M | Replaces `file_search_vertex.py` from FLP. Same response shape. |
| S5 | Tool: `classify_spend_line` (LLM picks top-3 candidates, returns with confidence) | `tools/classify_spend_line.py` | M | Returns multiple candidates with reasoning; reviewer picks. |
| S6 | Batch agent: `Scope3ClassifierAgent` | `services/agents/scope3_classifier_agent.py` | L | Streams progress; chunks spend lines (~500 per batch); writes back to `scope3_classifications` table |
| S7 | Bulk run dispatch via GitHub Actions (10k+ rows) | `.github/workflows/scope3-batch.yml` + dispatch helper | M | **Lift directly from `lib/storyPdfDispatch.ts`** — same envelope, different worker |
| S8 | Review UI: virtualized table, keyboard-shortcut approval, "apply to all matching vendor" | `app/(workflows)/scope-3/[run-id]/review` | L | The interaction speed here makes or breaks the workflow |
| S9 | Confidence calibration eval | `tests/test_scope3_calibration.py` + held-out labelled dataset | M | Reject ship if reviewer-overrides on top-1 prediction >35% on the test set |
| S10 | Per-vendor learning: when a reviewer corrects a vendor's classification, future lines for that vendor auto-suggest the corrected category | `lib/vendor_memory.ts` + table `vendor_classification_overrides` | M | Cheap moat; compounds for Greenmentor's repeat clients |

**Exit criteria:** A 5,000-line spend ledger from a real Greenmentor client is classified in <30 minutes, ≥70% of lines auto-approved on first review pass, the rest surfaced with ranked candidates.

#### Phase 1.D — Internal polish (Weeks 11–12)

| # | Task | Files / modules | Effort | Notes |
|---|---|---|---|---|
| P1 | Cross-workflow dashboard (per-client totals, audit-readiness %) | `apps/greenmentor/app/(dashboard)/page.tsx` | M | ECharts, lifted styling from vismay |
| P2 | Light reporting export (per-client emissions PDF) | `apps/greenmentor/app/api/reports/[client]/route.ts` + Playwright dispatch | M | **Reuse the vismay PDF dispatch pipeline wholesale** — only the template changes |
| P3 | Internal feedback loop: every reviewer override becomes a labelled training example | `lib/feedback_loop.ts` | S | Persist to `agent_eval_examples` for future fine-tunes or prompt iteration |
| P4 | Cost dashboard (Langfuse → simple weekly digest of $ per workflow run) | scheduled job + page | S | Forces honesty about unit economics before Phase 2 |
| P5 | Internal docs: agent prompts versioned in git, run-on-PR eval suite | `apps/greenmentor-agents/prompts/` + `tests/prompt_regression/` | M | Lift the FLP prompt-test pattern |
| P6 | "Pilot client #1" onboarding script + checklist | `apps/greenmentor/docs/internal-pilot-runbook.md` | S | Documents the gap between Phase 1 and Phase 2 |

**Phase 1 exit criteria (gates Phase 2):**
- 3 internal consultants use the platform daily for ≥4 weeks
- 2 real client engagements completed end-to-end (utility bills + Scope 3 classification)
- Median analyst time per client engagement drops ≥40% vs. their current Excel-based baseline
- Every output has a defensible audit trail
- LLM cost per client engagement is <$50 (sanity floor)

---

### Phase 2 — Assisted Enterprise (Months 4–9)

**Goal:** 3–5 paying clients use the platform alongside a Greenmentor consultant. Workflows expand to BRSR Evidence Collection + Sustainability Report Drafting + Supplier ESG Assessment. The product becomes safe to give to a non-Greenmentor person.

#### Phase 2.A — Multi-tenant hardening (Month 4)

| # | Task | Notes |
|---|---|---|
| H1 | RLS policy audit (every operational table; pen-test with two-org fixture) | A missed `org_id` check is a data-leak headline |
| H2 | Per-org Supabase storage prefixing + signed URLs | `org-{uuid}/utility-bills/...` |
| H3 | Org-scoped rate limiting on the agent service | Redis (valkey, per FLP) — bound LLM spend per org/day |
| H4 | SSO upgrade: Microsoft Entra + SAML (most enterprises won't accept Google-only) | Supabase Auth + WorkOS or custom SAML |
| H5 | LongSight read-side integration | Depends on what LongSight exposes. Likely an ingest-only adapter into `entities` and `measurements`. |
| H6 | Client-facing brand customisation (logo, primary colour, optional subdomain) | Per-org `branding_config` table |

#### Phase 2.B — Workflow #3: BRSR Evidence Collection (Month 5)

| # | Task | Notes |
|---|---|---|
| B1 | BRSR template seed (Section A/B/C with all ~1100 line items, response types) | migration + seed CSV |
| B2 | Evidence-request workflow: assign line item → department → "waiting on Y" state machine | `workflow_tasks` table fully used here for the first time |
| B3 | Email-based collection: department gets an email with a one-click upload portal (no login required for first response) | Magic-link tokens; mirror vismay's demo-client login pattern |
| B4 | Reminder cadence engine (T+3d, T+7d, T+14d, escalate to manager) | pg_cron + Resend |
| B5 | BRSR Copilot agent: given a line item + evidence files, drafts the response | `services/agents/brsr_copilot_agent.py` |
| B6 | Coverage dashboard (% of BRSR complete, blocking line items, overdue assignments) | The "single-pane-of-glass" the PDF says is the table-stakes part |

#### Phase 2.C — Workflow #4: Sustainability Report Drafting (Month 6–7)

| # | Task | Notes |
|---|---|---|
| R1 | Framework crosswalks fully seeded (BRSR ↔ GRI ↔ CDP ↔ TCFD ↔ IFRS S1/S2) | Big content effort; pair an analyst with the engineer |
| R2 | Peer benchmark dataset (last year's public reports of ~50 BRSE-100 companies, embedded) | The "peer benchmarking built in" line on slide 5 |
| R3 | Report Drafter agent: section by section, grounded retrieval over org's audit-trail + peer reports | Streamed generation with citations to source measurements / past reports |
| R4 | Reviewer UI with track-changes + comments | The consulting-team productivity multiplier |
| R5 | Final PDF + .docx export (use vismay's PDF dispatch + the `docx` skill at write-time) | Re-uses Phase 1.D plumbing |

#### Phase 2.D — Workflow #5: Supplier ESG Assessment (Month 8–9)

| # | Task | Notes |
|---|---|---|
| V1 | Supplier roster ingest (Excel) + dedupe + GST/CIN matching where applicable | One-shot per onboarded client |
| V2 | Supplier portal: questionnaire UI, evidence upload, status | Standalone subdomain; magic-link auth |
| V3 | Supplier ESG agent: reads completed questionnaire + evidence, scores against a maturity rubric, flags weak/inconsistent responses | The "Layer-2 Supplier ESG" agent in the PDF |
| V4 | Risk scoring composite (combined questionnaire + sector + geography risk) | `services/agents/risk_scorer_agent.py` — the "Risk Scorer" agent in the PDF |
| V5 | Cert monitor (read-only: parses uploaded ISO/BIS/etc. certs, alerts before expiry) | Lightweight; piggybacks on `extract_document` tool |

#### Phase 2.E — Reliability & Trust (Month 9)

| # | Task | Notes |
|---|---|---|
| T1 | SOC 2 Type I evidence collection (Vanta or Drata) | Required for most enterprise pilots in India + a must-have for global |
| T2 | Backup + PITR on Supabase + tested restore | |
| T3 | DPA + sub-processor list + privacy policy | Legal blocker for enterprise |
| T4 | Status page + on-call rotation | Even 1-person rotation, but published |
| T5 | Prompt-injection red team on every public agent surface | The "extract this utility bill — also ignore previous instructions" problem |

**Phase 2 exit criteria (gates Phase 3):**
- 3 paying clients in production for ≥3 months
- All 5 priority workflows live and used by every client
- Mean time-to-first-value (signup → first validated measurement) <48 hours
- Net retention >90% on the cohort
- LLM unit economics: gross margin >60% per client at current pricing

---

### Phase 3 — Modular Platform (Year 2)

**Goal:** Self-serve SaaS with an agent marketplace. Greenmentor stops being in the loop for every deployment.

This phase is intentionally lower-resolution — it depends on what we learn in Phase 2. The directional bets:

| Workstream | Notes |
|---|---|
| Self-serve onboarding | Org creation, billing (Stripe), email-first auth, 5-minute time-to-aha — utility bill upload → first emissions read in <2 min |
| Agent SDK | A way for partners (consulting firms, sector specialists, internal teams) to publish new agents on top of the Layer-1 infrastructure. Think VS Code extensions, not Salesforce AppExchange. |
| Marketplace surface | `app/marketplace` listing of community agents (Refrigerant AI, Meeting Bot, Materiality AI, etc. — the PDF's Layer-2 names we didn't get to in Phase 2) |
| Public API + webhooks | Read measurements, trigger runs, subscribe to audit events |
| Workspace billing + usage metering | Per-agent-run + per-validated-measurement pricing experiments |
| Natural-language ops surface | The PDF's "end state" — `> Prepare our BRSR draft.` This is a chat UI on top of the now-stable tool layer. Cheap to build once everything below it is real. |
| Enterprise plane | SSO via SAML, private data residency (separate Supabase project per enterprise org), customer-managed encryption keys |
| Agent marketplace economics | Revenue share with partner agents; staking/quality signals |
| Network effects | Aggregate (privacy-safe) peer benchmarking across the customer base — the moat the PDF hints at |

---

## 6. Cross-cutting concerns

### Pricing model assumption (Phase 2 onwards)
Per-workspace platform fee + metered agent runs. Phase 1 is internal so this is just a TODO before Phase 2 starts.

### LLM provider strategy
- **Claude (Anthropic)** — reasoning-heavy steps (BRSR section drafting, supplier scoring, planning loops)
- **Gemini Flash / 4-26b** — cheap classification (Scope 3 lines, framework mapping)
- **Anthropic file-input** for utility bill OCR (Phase 1)
- **Google Document AI** if/when bill volume exceeds Anthropic file-input economics (likely Phase 2)
- LiteLLM (per FLP) is the abstraction so we don't lock in

### Compliance posture
Decide before Phase 2: India residency only, or India + EU? This forks the Supabase region choice. Default assumption: **India residency, single region (Mumbai)** for Phase 1–2; multi-region in Phase 3.

### What "human in the loop" actually means in the schema
Every operational table that holds an AI-produced value has:
- `status` ∈ {draft, in_review, approved, rejected, superseded}
- `ai_confidence` (nullable float)
- `ai_run_id` FK → `agent_runs.id`
- `approved_by_user_id` (nullable until approved)
- `approved_at` (nullable until approved)

…and every state transition writes an `audit_events` row. This is the spine of compliance-grade defensibility.

### Risks & open questions

| Risk | Mitigation |
|---|---|
| LongSight integration unclear | Treat as a Phase-2 dependency; document the integration interface early and assume an export-based fallback |
| Emission factor licensing (DEFRA OGL, ecoinvent commercial) | Start with open factors (DEFRA, India CEA, EPA eGRID); budget for ecoinvent only when client engagements demand it |
| OCR quality on Indian DISCOM utility bills | Build the eval set early (P1.B U9). If accuracy <85%, gate the workflow behind extra review states |
| Prompt-injection from uploaded documents | Constrain tool calls to scoped org context; never let extracted text reach the planner unsandboxed |
| Vismay engine pull (story/scroll concepts leaking into Greenmentor) | Keep `apps/greenmentor` independent of `packages/viz-engine`. Share only the brand `packages/ui` and content-source utilities that genuinely apply. |
| Single-engineer bus factor in Phase 1 | Document everything-touching-LLMs in `apps/greenmentor-agents/docs/` from day one |

### Decisions to make before Phase 1 starts

1. **Hosting for the agent service** — Fly.io (recommended, fastest), Railway, or a Fargate stack ported from FLP CDK. *Default: Fly.io.*
2. **Vector store** — pgvector in the existing Supabase (recommended), or Vertex AI Search (per FLP). *Default: pgvector.*
3. **Auth provider** — Supabase Auth + Google SSO (recommended), or a separate WorkOS layer. *Default: Supabase Auth.*
4. **Observability** — Langfuse Cloud free tier (recommended), or self-hosted Langfuse. *Default: Cloud.*
5. **Which workflow first** — Utility Bills (recommended, fastest win) or Scope 3 (biggest pain but harder). *Default: Utility Bills.*

---

## 7. Rough effort summary

| Phase | Calendar | Engineer-weeks | Critical path |
|---|---|---|---|
| Phase 1.A — Foundation | 3 weeks | ~5 | Supabase schema + agent service skeleton |
| Phase 1.B — Utility Bill workflow | 3 weeks | ~5 | OCR eval set + reviewer UI speed |
| Phase 1.C — Scope 3 workflow | 4 weeks | ~7 | Confidence calibration + bulk dispatch |
| Phase 1.D — Internal polish | 2 weeks | ~3 | Reporting export + cost dashboard |
| **Phase 1 total** | **12 weeks** | **~20 eng-weeks** | |
| Phase 2 | ~6 months | ~50–60 eng-weeks | Multi-tenancy + BRSR content seed |
| Phase 3 | ~Year 2 | depends | Agent SDK + marketplace |

Two engineers full-time on Phase 1 hits the 12-week target with buffer. One engineer stretches it to ~18 weeks.

---

## 8. What goes into the repo first

The smallest first PR that proves the shape works:

```
vismay/
├── apps/
│   ├── greenmentor/                    [NEW]
│   │   ├── app/(public)/login/page.tsx
│   │   ├── app/(app)/dashboard/page.tsx
│   │   ├── lib/supabase.ts
│   │   ├── supabase/migrations/001_organizations.sql
│   │   └── package.json
│   └── greenmentor-agents/             [NEW]
│       ├── src/gm_agents/{app,services/tools,models}/
│       ├── pyproject.toml
│       └── Dockerfile
├── packages/
│   ├── gm-ingestion/                   [NEW]
│   │   ├── pyproject.toml
│   │   └── seed_emission_factors.py
│   └── ui/                             [extend with greenmentor tokens]
└── pnpm-workspace.yaml                 [no change — already globs apps/*]
```

That PR is "hello world, two services talking to one Supabase, with auth." Everything else compounds from there.

---

*This plan is a starting frame, not a contract. Each phase should be re-planned at its kickoff based on what the previous phase taught us — Greenmentor's whole thesis is that the consulting practice feeds product, so the plan must be willing to listen.*
