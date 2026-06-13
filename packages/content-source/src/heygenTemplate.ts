/**
 * HeyGen Template API client (vertical-agnostic).
 *
 * HeyGen Templates are the reusable layouts you build in the HeyGen web UI —
 * avatars, text blocks, media placeholders and brand styling, with named
 * *variables* for the parts that change per render. This module is the thin
 * fetch wrapper over the four endpoints that drive a template render:
 *
 *   listTemplates()      GET  /v2/templates                       — discover IDs
 *   getTemplate(id)      GET  /v2/template/{id}                   — read variables
 *   generateFromTemplate POST /v2/template/{id}/generate          — fill + render
 *   getVideoStatus(id)   GET  /v1/video_status.get?video_id={id}  — poll result
 *
 * Typical flow: get the template → inspect `variables` to learn the slot names
 * and types → build a matching `variables` map → generate → poll until the
 * status is `completed`, then read `video_url`.
 *
 * These are HeyGen's **v2** template endpoints. HeyGen now markets v3, but the
 * v1/v2 endpoints remain fully operational through 2026-10-31. If/when we move
 * to v3, only `HEYGEN_BASE_URL` and the request/response shapes below change —
 * callers keep the same function signatures.
 *
 * Key handling mirrors `storyAudioGenerate.ts`: read `process.env.HEYGEN_API_KEY`
 * at call time, overridable via an options param for injection/testing. No axios —
 * native fetch, same as every other external client in this package.
 */

/* ─── Config ───────────────────────────────────────────────────────── */

const DEFAULT_BASE_URL = 'https://api.heygen.com'

export interface HeygenClientOptions {
  /** HeyGen API key (default `process.env.HEYGEN_API_KEY`). */
  apiKey?: string
  /** API origin (default `https://api.heygen.com`, or `HEYGEN_BASE_URL`). */
  baseUrl?: string
}

function resolveKey(options: HeygenClientOptions): string {
  const key = options.apiKey ?? process.env.HEYGEN_API_KEY
  if (!key || !key.trim()) {
    throw new Error(
      'HEYGEN_API_KEY is not set. Provide it via options.apiKey or the ' +
        'HEYGEN_API_KEY environment variable.',
    )
  }
  return key.trim()
}

function resolveBaseUrl(options: HeygenClientOptions): string {
  return (
    options.baseUrl ?? process.env.HEYGEN_BASE_URL ?? DEFAULT_BASE_URL
  ).replace(/\/$/, '')
}

/** Raised when HeyGen returns a non-2xx response or an `error` envelope. */
export class HeygenApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message)
    this.name = 'HeygenApiError'
  }
}

/**
 * Single fetch helper. HeyGen wraps successful bodies as
 * `{ error: null, data: {...} }` (v2) or `{ code, data, message }` (v1 status);
 * a populated `error`/non-100 `code` is a logical failure even on HTTP 200, so
 * we surface both. Returns the unwrapped `data` payload.
 */
async function heygenFetch<T>(
  path: string,
  options: HeygenClientOptions,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${resolveBaseUrl(options)}${path}`, {
    ...init,
    headers: {
      'X-Api-Key': resolveKey(options),
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  const text = await res.text()
  if (!res.ok) {
    throw new HeygenApiError(
      `HeyGen ${path} failed: ${res.status}`,
      res.status,
      text.slice(0, 500),
    )
  }

  let json: any
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new HeygenApiError(
      `HeyGen ${path} returned non-JSON`,
      res.status,
      text.slice(0, 500),
    )
  }

  // v2 error envelope: { error: { code, message } | null, data }.
  if (json && json.error) {
    const msg =
      typeof json.error === 'string'
        ? json.error
        : json.error?.message ?? JSON.stringify(json.error)
    throw new HeygenApiError(`HeyGen ${path} error: ${msg}`, res.status, text.slice(0, 500))
  }

  return (json?.data ?? json) as T
}

/* ─── Templates ────────────────────────────────────────────────────── */

export interface HeygenTemplateSummary {
  template_id: string
  name?: string
  thumbnail_image_url?: string
}

/** List the templates available to the account. */
export async function listTemplates(
  options: HeygenClientOptions = {},
): Promise<HeygenTemplateSummary[]> {
  const data = await heygenFetch<{ templates?: HeygenTemplateSummary[] }>(
    '/v2/templates',
    options,
  )
  return data.templates ?? []
}

/**
 * A single template variable, as returned by `getTemplate` and as sent in the
 * `generate` body. The shape is symmetric: read the template to learn the
 * `name`/`type` of each slot, then send back the same objects with `properties`
 * filled in.
 *
 *   text   → properties.content
 *   image  → properties.url | properties.asset_id, optional properties.fit
 *   video  → properties.url | properties.asset_id, optional properties.fit
 *   audio  → properties.url | properties.asset_id
 *   character/voice and other slot types pass through as-is.
 */
export interface HeygenVariableProperties {
  content?: string
  url?: string
  asset_id?: string | null
  fit?: 'contain' | 'cover' | 'crop' | 'none'
  [key: string]: unknown
}

export interface HeygenVariable {
  name: string
  type: 'text' | 'image' | 'video' | 'audio' | string
  properties: HeygenVariableProperties
}

export interface HeygenTemplateDetail {
  template_id?: string
  name?: string
  /** Map of variable name → variable definition. */
  variables: Record<string, HeygenVariable>
}

/** Fetch a template's detail — `variables` lists the fillable slots. */
export async function getTemplate(
  templateId: string,
  options: HeygenClientOptions = {},
): Promise<HeygenTemplateDetail> {
  const data = await heygenFetch<HeygenTemplateDetail>(
    `/v2/template/${encodeURIComponent(templateId)}`,
    options,
  )
  return { ...data, variables: data.variables ?? {} }
}

/* ─── Generate ─────────────────────────────────────────────────────── */

export interface GenerateFromTemplateOptions extends HeygenClientOptions {
  templateId: string
  /** Variable name → filled variable. Keys must match the template's slots. */
  variables: Record<string, HeygenVariable>
  /** Dashboard title for the render. */
  title?: string
  /** Output pixel size. Defaults to the template's own dimension when omitted. */
  dimension?: { width: number; height: number }
  /** Burn in captions. */
  caption?: boolean
  /**
   * `true` = a free, watermarked preview render. Use this while iterating so
   * test renders don't consume paid credits. Defaults to `false`.
   */
  test?: boolean
}

export interface GenerateFromTemplateResult {
  videoId: string
}

/**
 * Kick off a template render. Returns immediately with a `videoId`; the video
 * is produced asynchronously — poll `getVideoStatus(videoId)` (or use
 * `pollVideo`) until it reports `completed`.
 */
export async function generateFromTemplate(
  options: GenerateFromTemplateOptions,
): Promise<GenerateFromTemplateResult> {
  const { templateId, variables, title, dimension, caption, test } = options
  const body: Record<string, unknown> = { variables }
  if (title !== undefined) body.title = title
  if (dimension !== undefined) body.dimension = dimension
  if (caption !== undefined) body.caption = caption
  if (test !== undefined) body.test = test

  const data = await heygenFetch<{ video_id: string }>(
    `/v2/template/${encodeURIComponent(templateId)}/generate`,
    options,
    { method: 'POST', body: JSON.stringify(body) },
  )
  if (!data.video_id) {
    throw new HeygenApiError(
      'HeyGen generate returned no video_id',
      200,
      JSON.stringify(data).slice(0, 500),
    )
  }
  return { videoId: data.video_id }
}

/* ─── Status + polling ─────────────────────────────────────────────── */

export type HeygenVideoStatus =
  | 'waiting'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'

export interface HeygenVideoState {
  status: HeygenVideoStatus | string
  videoUrl?: string
  thumbnailUrl?: string
  duration?: number
  error?: string | null
}

/** One-shot status read for a video id. */
export async function getVideoStatus(
  videoId: string,
  options: HeygenClientOptions = {},
): Promise<HeygenVideoState> {
  const data = await heygenFetch<{
    status: string
    video_url?: string
    thumbnail_url?: string
    duration?: number
    error?: unknown
  }>(`/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, options)
  return {
    status: data.status,
    videoUrl: data.video_url,
    thumbnailUrl: data.thumbnail_url,
    duration: data.duration,
    error:
      data.error == null
        ? null
        : typeof data.error === 'string'
          ? data.error
          : JSON.stringify(data.error),
  }
}

/** Raised when `pollVideo` exceeds its timeout without a terminal status. */
export class HeygenTimeoutError extends Error {
  constructor(
    readonly videoId: string,
    readonly lastStatus: string,
  ) {
    super(`HeyGen video ${videoId} still ${lastStatus} after timeout`)
    this.name = 'HeygenTimeoutError'
  }
}

export interface PollVideoOptions extends HeygenClientOptions {
  /** Seconds between polls (default 10). */
  intervalMs?: number
  /** Give up after this long (default 10 min). Throws HeygenTimeoutError. */
  timeoutMs?: number
  /** Optional progress callback fired on every poll. */
  onPoll?: (state: HeygenVideoState) => void
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Poll a video to completion. Resolves with the final state on `completed`,
 * throws `HeygenApiError` on `failed`, and throws `HeygenTimeoutError` if the
 * timeout elapses while still processing (the caller keeps the videoId and can
 * resume polling later).
 */
export async function pollVideo(
  videoId: string,
  options: PollVideoOptions = {},
): Promise<HeygenVideoState> {
  const intervalMs = options.intervalMs ?? 10_000
  const timeoutMs = options.timeoutMs ?? 10 * 60_000
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const state = await getVideoStatus(videoId, options)
    options.onPoll?.(state)

    if (state.status === 'completed') return state
    if (state.status === 'failed') {
      throw new HeygenApiError(
        `HeyGen video ${videoId} failed: ${state.error ?? 'unknown error'}`,
        200,
        state.error ?? '',
      )
    }
    if (Date.now() + intervalMs > deadline) {
      throw new HeygenTimeoutError(videoId, state.status)
    }
    await sleep(intervalMs)
  }
}

/* ─── Convenience helpers ──────────────────────────────────────────── */

/** Build a text variable from a slot name + string. */
export function textVar(name: string, content: string): HeygenVariable {
  return { name, type: 'text', properties: { content } }
}

/** Build an image/video/audio variable from a slot name + public URL. */
export function urlVar(
  name: string,
  type: 'image' | 'video' | 'audio',
  url: string,
  fit?: HeygenVariableProperties['fit'],
): HeygenVariable {
  return { name, type, properties: fit ? { url, fit } : { url } }
}

/** Generate then poll to completion in one call. */
export async function generateAndWait(
  options: GenerateFromTemplateOptions & Omit<PollVideoOptions, keyof HeygenClientOptions>,
): Promise<HeygenVideoState & { videoId: string }> {
  const { videoId } = await generateFromTemplate(options)
  const state = await pollVideo(videoId, options)
  return { ...state, videoId }
}
