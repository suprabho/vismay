/**
 * The source policy registry, in code. It mirrors the seed rows of
 * curious_sources (migration 101) so a collector can refuse a fetch without
 * a database round trip, and the tests can run without one. Access is a
 * configuration matter, not crawler code: a collector asks `assertAllowed`
 * before its first request and sizes its limiter from `policyFor`.
 */

import type { AccessMethod, SourceId, SourcePolicy } from './types'

const TERMS_CHECKED = '2026-11-04'

export const SOURCE_POLICIES: Record<SourceId, SourcePolicy> = {
  gdelt: {
    id: 'gdelt', name: 'GDELT DOC 2.0', kind: 'news-index', baseUrl: 'https://api.gdeltproject.org/api/v2/doc/doc',
    allowedMethod: 'api', crawlDelayMs: 5000, ratePerMin: 12, retentionDays: 365, commercialReuse: false,
    fulltextStorage: 'none', personalDataPolicy: 'public-figures',
    termsUrl: 'https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/', termsLastChecked: TERMS_CHECKED, enabled: true,
    institutionalQuality: 0.3,
  },
  loc: {
    id: 'loc', name: 'Library of Congress', kind: 'library', baseUrl: 'https://www.loc.gov',
    allowedMethod: 'api', crawlDelayMs: 1200, ratePerMin: 40, retentionDays: 3650, commercialReuse: true,
    fulltextStorage: 'full', personalDataPolicy: 'public-figures',
    termsUrl: 'https://www.loc.gov/apis/json-and-yaml/', termsLastChecked: TERMS_CHECKED, enabled: true,
    institutionalQuality: 1,
  },
  europeana: {
    id: 'europeana', name: 'Europeana', kind: 'aggregator', baseUrl: 'https://api.europeana.eu/record/v2',
    allowedMethod: 'api', crawlDelayMs: 500, ratePerMin: 100, retentionDays: 3650, commercialReuse: false,
    fulltextStorage: 'snippet', personalDataPolicy: 'public-figures',
    termsUrl: 'https://pro.europeana.eu/page/api-terms-of-use', termsLastChecked: TERMS_CHECKED, enabled: true,
    institutionalQuality: 0.9,
  },
  gallica: {
    id: 'gallica', name: 'BnF Gallica', kind: 'library', baseUrl: 'https://gallica.bnf.fr',
    allowedMethod: 'sru', crawlDelayMs: 12_000, ratePerMin: 5, retentionDays: 3650, commercialReuse: true,
    fulltextStorage: 'full', personalDataPolicy: 'public-figures',
    termsUrl: 'https://gallica.bnf.fr/html/und/conditions-dutilisation-des-contenus-de-gallica', termsLastChecked: TERMS_CHECKED,
    // gallica.bnf.fr sits behind a Cloudflare rule that blocks datacenter IP ranges outright ("Sorry, you have
    // been blocked" on every path, including the home page): GitHub-hosted runners and cloud sessions never get
    // through, and a bot wall is not something to spoof past. Flip this on when collecting from a network BnF
    // allows (an office or home connection), or once BnF grants API access.
    enabled: false,
    institutionalQuality: 1,
  },
  crossref: {
    id: 'crossref', name: 'Crossref', kind: 'registry', baseUrl: 'https://api.crossref.org',
    allowedMethod: 'api', crawlDelayMs: 1000, ratePerMin: 50, retentionDays: 3650, commercialReuse: true,
    fulltextStorage: 'none', personalDataPolicy: 'none',
    termsUrl: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/', termsLastChecked: TERMS_CHECKED, enabled: true,
    institutionalQuality: 0.9,
  },
  'google-books': {
    id: 'google-books', name: 'Google Books', kind: 'registry', baseUrl: 'https://www.googleapis.com/books/v1',
    allowedMethod: 'api', crawlDelayMs: 1000, ratePerMin: 60, retentionDays: 3650, commercialReuse: false,
    fulltextStorage: 'snippet', personalDataPolicy: 'none',
    termsUrl: 'https://developers.google.com/books/terms', termsLastChecked: TERMS_CHECKED, enabled: true,
    institutionalQuality: 0.7,
  },
  wikidata: {
    id: 'wikidata', name: 'Wikidata', kind: 'registry', baseUrl: 'https://www.wikidata.org/w/api.php',
    allowedMethod: 'api', crawlDelayMs: 1000, ratePerMin: 60, retentionDays: 3650, commercialReuse: true,
    fulltextStorage: 'none', personalDataPolicy: 'public-figures',
    termsUrl: 'https://www.wikidata.org/wiki/Wikidata:Data_access', termsLastChecked: TERMS_CHECKED, enabled: true,
    institutionalQuality: 0.6,
  },
  web: {
    id: 'web', name: 'Publisher pages', kind: 'web', baseUrl: null,
    allowedMethod: 'html', crawlDelayMs: 2000, ratePerMin: 20, retentionDays: 0, commercialReuse: false,
    fulltextStorage: 'none', personalDataPolicy: 'public-figures',
    termsUrl: null, termsLastChecked: TERMS_CHECKED, enabled: true,
    institutionalQuality: 0.3,
  },
  // The LLM desk (llm.ts): pages a model found through the AI Gateway's web search. Each cited page is read
  // once under robots.txt to check the quote, and only the evidence quote (at most 300 characters) is kept.
  // The checker scores each page's quality itself; 0.5 is the floor the grader starts from.
  'web-search': {
    id: 'web-search', name: 'Web search (LLM desk)', kind: 'web', baseUrl: null,
    allowedMethod: 'api', crawlDelayMs: 2000, ratePerMin: 20, retentionDays: 0, commercialReuse: false,
    fulltextStorage: 'none', personalDataPolicy: 'public-figures',
    termsUrl: 'https://vercel.com/docs/ai-gateway', termsLastChecked: '2026-11-05', enabled: true,
    institutionalQuality: 0.5,
  },
}

export class PolicyError extends Error {
  constructor(message: string, readonly sourceId: SourceId) {
    super(message)
    this.name = 'PolicyError'
  }
}

export function policyFor(id: SourceId, policies: Record<SourceId, SourcePolicy> = SOURCE_POLICIES): SourcePolicy {
  const p = policies[id]
  if (!p) throw new PolicyError(`No source policy for "${id}".`, id)
  return p
}

/**
 * Refuse before fetching: a disabled source, a method the policy does not
 * allow, or a source whose terms have not been checked in a year.
 */
export function assertAllowed(
  id: SourceId,
  opts: { method: AccessMethod; now?: Date; policies?: Record<SourceId, SourcePolicy> },
): SourcePolicy {
  const p = policyFor(id, opts.policies)
  if (!p.enabled) {
    throw new PolicyError(
      id === 'gallica'
        ? `${p.name} is disabled: gallica.bnf.fr's Cloudflare blocks datacenter IP ranges (GitHub's runners included) on every path. Run the Gallica collector from a network BnF allows and enable it in packages/curious-pipeline/src/policy.ts.`
        : `${p.name} is disabled in the source policy registry (policy.ts, mirrored by curious_sources.enabled).`,
      id,
    )
  }
  if (p.allowedMethod === 'none') throw new PolicyError(`${p.name} allows no automated access.`, id)
  if (opts.method !== p.allowedMethod && !(p.allowedMethod === 'sru' && opts.method === 'iiif')) {
    throw new PolicyError(`${p.name} allows "${p.allowedMethod}" access, not "${opts.method}".`, id)
  }
  const now = opts.now ?? new Date()
  if (p.termsLastChecked) {
    const age = (now.getTime() - Date.parse(p.termsLastChecked)) / 86_400_000
    if (age > 400) throw new PolicyError(`${p.name}'s terms were last checked on ${p.termsLastChecked}, over a year ago. Re-check them and update the registry before collecting.`, id)
  }
  return p
}

/** Whether the policy lets a document of this source keep its text at all, and how much. */
export function textStorageFor(id: SourceId, opts: { publicDomain: boolean }): 'full' | 'snippet' | 'none' {
  const p = policyFor(id)
  if (p.fulltextStorage === 'full') return opts.publicDomain ? 'full' : 'snippet'
  return p.fulltextStorage
}
