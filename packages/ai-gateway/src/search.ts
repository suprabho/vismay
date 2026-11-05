import { generateText as aiGenerateText, stepCountIs } from 'ai'
import { getGatewayClient } from './client'
import { resolveModel } from './models'

/**
 * Agentic web research through the AI Gateway's Perplexity Search tool.
 *
 * The model searches as many times as it needs (up to `maxSteps`), then
 * writes its notes. Every result the search tool returned is collected from
 * the steps, so the caller gets the real URLs, titles, snippets and dates
 * the model saw, and can refuse any citation that is not one of them. The
 * search runs on the gateway (provider-executed), so no search API key is
 * needed beyond the gateway's own auth.
 */

export interface WebResult {
  url: string
  title: string
  snippet: string
  date: string | null
  /** The query that first returned this URL. */
  query: string
}

export interface ResearchOptions {
  /** Alias from MODELS.text or a raw gateway id. Defaults to text.sonnet. */
  model?: string
  system?: string
  prompt: string
  /** Model → search → model rounds (default 12). */
  maxSteps?: number
  /** Results per search (1-20, default 8). */
  maxResults?: number
  /** Tokens extracted per result page (256-2048, default 1024). */
  maxTokensPerPage?: number
  /** Domains to include or, prefixed with "-", exclude (max 20). */
  searchDomainFilter?: string[]
  maxOutputTokens?: number
  metadata?: Record<string, string>
}

export interface ResearchResult {
  text: string
  results: WebResult[]
  queries: string[]
  modelUsed: string
}

interface PerplexityOutput {
  results?: Array<{ url?: string; title?: string; snippet?: string; date?: string; lastUpdated?: string }>
  error?: string
  message?: string
}

/** Pull the search results out of a run's steps, first sighting of each URL wins. Exported for tests. */
export function collectSearchResults(
  steps: ReadonlyArray<{ toolResults?: ReadonlyArray<{ toolName?: string; input?: unknown; output?: unknown }> }>,
): { results: WebResult[]; queries: string[] } {
  const byUrl = new Map<string, WebResult>()
  const queries: string[] = []
  for (const step of steps) {
    for (const tr of step.toolResults ?? []) {
      const input = (tr.input ?? {}) as { query?: string | string[] }
      const q = Array.isArray(input.query) ? input.query.join(' | ') : (input.query ?? '')
      if (q) queries.push(q)
      const out = (tr.output ?? {}) as PerplexityOutput
      for (const r of out.results ?? []) {
        if (!r.url || byUrl.has(r.url)) continue
        byUrl.set(r.url, { url: r.url, title: (r.title ?? '').trim(), snippet: (r.snippet ?? '').trim(), date: r.date ?? r.lastUpdated ?? null, query: q })
      }
    }
  }
  return { results: [...byUrl.values()], queries }
}

export async function researchWithWebSearch(opts: ResearchOptions): Promise<ResearchResult> {
  const gateway = getGatewayClient()
  const modelId = resolveModel(opts.model ?? 'text.sonnet')
  const res = await aiGenerateText({
    model: gateway(modelId),
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxOutputTokens,
    headers: opts.metadata,
    tools: {
      web_search: gateway.tools.perplexitySearch({
        maxResults: opts.maxResults ?? 8,
        maxTokensPerPage: opts.maxTokensPerPage ?? 1024,
        ...(opts.searchDomainFilter?.length ? { searchDomainFilter: opts.searchDomainFilter } : {}),
      }),
    },
    stopWhen: stepCountIs(opts.maxSteps ?? 12),
  })
  const { results, queries } = collectSearchResults(res.steps as unknown as Parameters<typeof collectSearchResults>[0])
  const modelUsed = (res.response as { modelId?: string } | undefined)?.modelId ?? modelId
  return { text: res.text, results, queries, modelUsed }
}
