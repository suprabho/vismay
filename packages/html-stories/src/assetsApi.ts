/**
 * The token-gated assets endpoint for agent-authored HTML stories: where an
 * agent puts the photos, video and AI illustrations its page links to (the
 * brief's "Photography and media", ./brief.ts), so they live on our storage
 * rather than hotlinked from a source that may move or vanish. Shared by every
 * site that hosts stories; each app's route handler is one line per method.
 *
 *   GET  ?slug=<slug>   — what the slug already has: url, type, size and the
 *                         credit, licence and source each was saved with.
 *   POST ?slug=<slug>   — add one, from one of three bodies:
 *     - JSON `{ fromUrl, credit?, license?, sourcePage?, filename? }`: the
 *       server fetches an openly licensed image or mp4 by its https URL.
 *     - JSON `{ generate: { prompt, aspectRatio?, model? }, filename? }`: an AI
 *       illustration through @vismay/ai-gateway, logged to ai_generations.
 *     - The bytes themselves with their image or video Content-Type, credit,
 *       license and filename in the query string (a request body is capped at
 *       ~4.5 MB on Vercel; fromUrl has no such limit).
 *
 * Same `Authorization: Bearer $HTML_STORIES_TOKEN` as ./publishApi. Files land
 * in the public story-assets bucket (migration 037) under html-stories/<slug>/,
 * named after their content hash, so saving the same image twice is a no-op.
 * The type comes from the file's own bytes, never the upstream header, and
 * only raster images and mp4 are taken: no SVG, which can carry script.
 *
 * Server only.
 */

import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { generateImage, hashRequest, recordGeneration, resolveModel } from '@vismay/ai-gateway'
import type { ImageAspectRatio } from '@vismay/ai-gateway/image'
import { createServiceClient } from '@vismay/content-source/supabase'
import type { HtmlStoryApp } from './apps'
import { isSafeSlug } from './meta'
import { HTML_STORIES_TOKEN_ENV, isHtmlStoriesTokenRequest } from './publishApi'

export const HTML_STORY_ASSETS_BUCKET = 'story-assets'
const PREFIX = 'html-stories'

const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_VIDEO_BYTES = 50 * 1024 * 1024
/** Above this the response suggests a smaller file: the page loads every one. */
const LARGE_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_PROMPT_LENGTH = 4000
const MAX_TEXT_LENGTH = 500
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 30_000
const ASPECTS: ImageAspectRatio[] = ['1:1', '16:9', '9:16', '4:3', '3:4']
const SAFE_NAME = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/
/** Wikimedia and others refuse requests without a descriptive agent. */
const USER_AGENT = 'vismay-html-stories/1.0 (+https://vizmaya.fyi)'

export type MediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/avif' | 'video/mp4'

const EXTENSIONS: Record<MediaType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

class AssetError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** The file's type from its magic bytes, or null for anything we don't host. */
export function sniffMediaType(bytes: Uint8Array): MediaType | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (bytes.length < 12) return null
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (ascii(0, 4) === 'GIF8') return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12)
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    // HEIC (heic, mif1, …) is an ftyp file too, but browsers can't show it.
    if (/^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |mmp4|dash|MSNV)$/.test(brand)) return 'video/mp4'
  }
  return null
}

function maxBytes(type: MediaType): number {
  return type === 'video/mp4' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
}

/** Loopback, private, link-local, CGNAT, multicast and unspecified addresses. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateAddress(mapped[1]!)
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    )
  }
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase()
    return v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6)
  }
  return true
}

/**
 * Refuses anything but a public https host. The token already limits who can
 * ask, so this guards against a typo or a poisoned search result pointing the
 * server at its own network, not against DNS rebinding between this check and
 * the fetch.
 */
async function assertPublicHttps(url: URL): Promise<void> {
  if (url.protocol !== 'https:') throw new AssetError('fromUrl must be an https URL')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (/^localhost$|\.(?:localhost|local|internal)$/i.test(host)) throw new AssetError(`refusing to fetch ${host}`)
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address)
  if (!addresses.length) throw new AssetError(`could not resolve ${host}`)
  if (addresses.some(isPrivateAddress)) throw new AssetError(`refusing to fetch ${host}: not a public address`)
}

/** Read a request or response body, giving up once it passes `limit` bytes. */
async function readCapped(res: Request | Response, limit: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'))
  if (declared > limit) throw new AssetError(`the file is ${(declared / 1024 / 1024).toFixed(1)} MB; the limit is ${limit / 1024 / 1024} MB`, 413)
  if (!res.body) return new Uint8Array(await res.arrayBuffer())
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new AssetError(`the file is over the ${limit / 1024 / 1024} MB limit`, 413)
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.byteLength
  }
  return out
}

async function fetchMedia(raw: string): Promise<{ bytes: Uint8Array; finalUrl: string }> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new AssetError('fromUrl is not a URL')
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHttps(url)
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'user-agent': USER_AGENT, accept: 'image/avif,image/webp,image/*,video/mp4;q=0.9' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch((e: unknown) => {
      throw new AssetError(`fetching ${url.hostname} failed: ${e instanceof Error ? e.message : String(e)}`, 502)
    })
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      if (!next) throw new AssetError(`${url.hostname} redirected without a location`, 502)
      url = new URL(next, url)
      continue
    }
    if (!res.ok) throw new AssetError(`${url.hostname} answered HTTP ${res.status}`, 502)
    return { bytes: await readCapped(res, MAX_VIDEO_BYTES), finalUrl: url.toString() }
  }
  throw new AssetError(`more than ${MAX_REDIRECTS} redirects`, 502)
}

/** A safe file stem from a caller's name or a source URL's last segment. */
export function fileStem(input: string | undefined): string {
  const base = (input ?? '').split(/[?#]/)[0]!.split('/').pop() ?? ''
  let decoded = base
  try {
    decoded = decodeURIComponent(base)
  } catch {}
  return decoded
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_TEXT_LENGTH) : undefined
}

interface Saved {
  url: string
  path: string
  contentType: MediaType
  bytes: number
  credit?: string
  license?: string
  sourceUrl?: string
  sourcePage?: string
}

async function store(
  slug: string,
  bytes: Uint8Array,
  stem: string | undefined,
  meta: Record<string, string | undefined>,
): Promise<Saved> {
  const type = sniffMediaType(bytes)
  if (!type) throw new AssetError('not a PNG, JPEG, GIF, WebP, AVIF or MP4 file', 415)
  if (bytes.byteLength > maxBytes(type)) {
    throw new AssetError(`the file is ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is ${maxBytes(type) / 1024 / 1024} MB`, 413)
  }
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10)
  const name = `${stem && SAFE_NAME.test(stem) ? `${stem}-` : ''}${hash}.${EXTENSIONS[type]}`
  const path = `${PREFIX}/${slug}/${name}`
  const metadata = Object.fromEntries(Object.entries(meta).filter(([, v]) => v)) as Record<string, string>

  const bucket = createServiceClient().storage.from(HTML_STORY_ASSETS_BUCKET)
  const { error } = await bucket.upload(path, bytes, {
    contentType: type,
    // Content-addressed, so an overwrite is the same file with fresher credits.
    upsert: true,
    cacheControl: '31536000',
    metadata,
  })
  if (error) throw new AssetError(`storage: ${error.message}`, 500)
  return { url: bucket.getPublicUrl(path).data.publicUrl, path, contentType: type, bytes: bytes.byteLength, ...metadata }
}

function warningsFor(saved: Saved, kind: 'copy' | 'upload' | 'generate'): string[] {
  const out: string[] = []
  if (kind !== 'generate' && !(saved.credit && saved.license)) {
    out.push('No credit or licence was given. Write both in the figure\'s <figcaption> (author, source, licence), and pass them here next time.')
  }
  if (saved.contentType !== 'video/mp4' && saved.bytes > LARGE_IMAGE_BYTES) {
    out.push(`This image is ${(saved.bytes / 1024 / 1024).toFixed(1)} MB. Prefer a ~1600px-wide version (Commons: the iiurlwidth thumbnail).`)
  }
  return out
}

async function generate(slug: string, body: Record<string, unknown>) {
  const g = body.generate as Record<string, unknown>
  const prompt = typeof g.prompt === 'string' ? g.prompt.trim() : ''
  if (!prompt) throw new AssetError('generate.prompt is required')
  if (prompt.length > MAX_PROMPT_LENGTH) throw new AssetError(`generate.prompt exceeds ${MAX_PROMPT_LENGTH} characters`)
  const aspectRatio = ASPECTS.includes(g.aspectRatio as ImageAspectRatio) ? (g.aspectRatio as ImageAspectRatio) : '16:9'
  // Aliases only: a raw gateway id would let a caller pick any model's price.
  const alias = typeof g.model === 'string' && g.model.startsWith('image.') ? g.model : 'image.default'
  let model: string
  try {
    model = resolveModel(alias)
  } catch (e) {
    throw new AssetError(e instanceof Error ? e.message : 'unknown model')
  }
  const out = await generateImage({ model: alias, prompt, aspectRatio, metadata: { feature: 'html-story-assets', slug } }).catch(
    (e: unknown) => {
      throw new AssetError(`image generation failed: ${e instanceof Error ? e.message : String(e)}`, 502)
    },
  )
  const saved = await store(slug, out.bytes, fileStem(text(body.filename)) || 'ai', {
    credit: 'Illustration: AI-generated',
    license: 'ai-generated',
  })
  const params = { aspectRatio, mimeType: out.mimeType }
  const warnings = warningsFor(saved, 'generate')
  try {
    await recordGeneration(createServiceClient(), {
      kind: 'image',
      storySlug: slug,
      prompt,
      model: out.modelUsed || model,
      params,
      requestHash: hashRequest({ model, prompt, params }),
      resultRef: saved.path,
      resultText: null,
    })
  } catch (e) {
    warnings.push(`Saved, but not logged to ai_generations: ${e instanceof Error ? e.message : String(e)}`)
  }
  return { saved, warnings, generation: { model: out.modelUsed || model, prompt } }
}

function slugFrom(req: Request): string {
  const slug = new URL(req.url).searchParams.get('slug')?.trim() ?? ''
  if (!isSafeSlug(slug)) {
    throw new AssetError('?slug= is required: the story slug, lowercase letters, digits and single hyphens (max 80 chars)')
  }
  return slug
}

function gate(req: Request): Response | null {
  if (!process.env[HTML_STORIES_TOKEN_ENV]) {
    return json({ error: `story assets are not configured (${HTML_STORIES_TOKEN_ENV} unset)` }, 503)
  }
  return isHtmlStoriesTokenRequest(req) ? null : json({ error: 'unauthorized' }, 401)
}

function failure(e: unknown): Response {
  if (e instanceof AssetError) return json({ error: e.message }, e.status)
  return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
}

/** POST /api/html-stories/assets?slug=<slug> for one app. */
export async function handleHtmlStoryAssetPost(req: Request, _app: HtmlStoryApp): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  try {
    const slug = slugFrom(req)
    const q = new URL(req.url).searchParams
    const type = req.headers.get('content-type') ?? ''

    if (!type.includes('application/json')) {
      if (!/^(?:image|video)\//i.test(type)) {
        throw new AssetError('send JSON ({"fromUrl"} or {"generate"}) or the file itself with its image/* or video/mp4 Content-Type', 415)
      }
      const bytes = await readCapped(req, MAX_VIDEO_BYTES)
      const saved = await store(slug, bytes, fileStem(q.get('filename') ?? undefined), {
        credit: text(q.get('credit')),
        license: text(q.get('license')),
        sourcePage: text(q.get('sourcePage')),
      })
      return json({ ok: true, ...saved, warnings: warningsFor(saved, 'upload') }, 201)
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') throw new AssetError('expected a JSON object')

    if (body.generate && typeof body.generate === 'object') {
      const { saved, warnings, generation } = await generate(slug, body)
      return json({ ok: true, ...saved, caption: 'Illustration: AI-generated', generation, warnings }, 201)
    }

    const fromUrl = text(body.fromUrl)
    if (!fromUrl) throw new AssetError('pass fromUrl (an https image or mp4 URL) or generate: { prompt }')
    const { bytes, finalUrl } = await fetchMedia(fromUrl)
    const saved = await store(slug, bytes, fileStem(text(body.filename) ?? new URL(finalUrl).pathname), {
      credit: text(body.credit),
      license: text(body.license),
      sourceUrl: fromUrl,
      sourcePage: text(body.sourcePage),
    })
    return json({ ok: true, ...saved, warnings: warningsFor(saved, 'copy') }, 201)
  } catch (e) {
    return failure(e)
  }
}

/** GET /api/html-stories/assets?slug=<slug> for one app. */
export async function handleHtmlStoryAssetList(req: Request, _app: HtmlStoryApp): Promise<Response> {
  const denied = gate(req)
  if (denied) return denied
  try {
    const slug = slugFrom(req)
    const bucket = createServiceClient().storage.from(HTML_STORY_ASSETS_BUCKET)
    const { data, error } = await bucket.list(`${PREFIX}/${slug}`, {
      limit: 200,
      sortBy: { column: 'created_at', order: 'asc' },
    })
    if (error) throw new AssetError(`storage: ${error.message}`, 500)
    const files = (data ?? []).filter((f) => f.id)
    const assets = await Promise.all(
      files.map(async (f) => {
        const path = `${PREFIX}/${slug}/${f.name}`
        const info = await bucket.info(path).catch(() => null)
        const meta = (info?.data?.metadata ?? {}) as Record<string, unknown>
        return {
          url: bucket.getPublicUrl(path).data.publicUrl,
          path,
          contentType: (f.metadata?.mimetype as string | undefined) ?? null,
          bytes: (f.metadata?.size as number | undefined) ?? null,
          createdAt: f.created_at,
          credit: text(meta.credit),
          license: text(meta.license),
          sourceUrl: text(meta.sourceUrl),
          sourcePage: text(meta.sourcePage),
        }
      }),
    )
    return json({ slug, assets })
  } catch (e) {
    return failure(e)
  }
}
