/**
 * Server-side: render a set of share cards (PNG) for a story.
 *
 * Drives the existing /story/<slug>/share page in headless Chromium, uses
 * the `window.__captureByIndex__` hook ShareShell exposes when it mounts,
 * and uploads each card's PNG to the `story-share` bucket.
 *
 * The renderer is keyed on (story_slug, card_id, ratio). `demo_id` is an
 * optional annotation written when the demo-curation path is the caller;
 * the social-post path leaves it null. Storage paths are
 * `{slug}/share/{cardId}__{ratio}.png`.
 *
 * Mirrors lib/storyPdfRender.ts: same Playwright launch flags, same admin
 * cookie pre-auth.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
import { ADMIN_COOKIE_NAME, expectedToken } from './adminAuth'

export const SHARE_BUCKET = 'story-share'
export const SHARE_RATIOS = ['1:1', '3:4', '4:3'] as const
export type ShareRatio = (typeof SHARE_RATIOS)[number]

export interface ShareRenderTarget {
  cardId: string
  ratio: ShareRatio
}

export interface ShareRenderResult {
  rendered: number
  skipped: number
  errors: { target: ShareRenderTarget; message: string }[]
}

const READY_TIMEOUT_MS = 60_000

const VIEWPORT_FOR_RATIO: Record<ShareRatio, { width: number; height: number }> = {
  '1:1': { width: 720, height: 720 },
  '3:4': { width: 720, height: 960 },
  '4:3': { width: 960, height: 720 },
}

interface ShareCardEntry {
  id: string
  index: number
  variant: string
  label: string
}

async function captureOne(
  page: Page,
  target: ShareRenderTarget,
  log: (m: string) => void
): Promise<Buffer> {
  // Cards rebuild on ratio change; refresh the listing every iteration to
  // avoid stale indices.
  const cards = (await page.evaluate(() => {
    interface W extends Window {
      __shareCards__?: ShareCardEntry[]
    }
    return (window as unknown as W).__shareCards__ ?? null
  })) as ShareCardEntry[] | null
  if (!cards) throw new Error('window.__shareCards__ not exposed — ShareShell did not mount')
  const match = cards.find((c) => c.id === target.cardId)
  if (!match) throw new Error(`card not found for id=${target.cardId}`)

  log(`  capturing ${target.cardId} @ ${target.ratio} (index=${match.index})`)
  const dataUrl = await page.evaluate(async (idx) => {
    interface W extends Window {
      __captureByIndex__?: (i: number) => Promise<string | null>
    }
    const fn = (window as unknown as W).__captureByIndex__
    if (!fn) throw new Error('__captureByIndex__ missing')
    return fn(idx)
  }, match.index)
  if (!dataUrl || typeof dataUrl !== 'string') throw new Error('capture returned null')
  const base64 = dataUrl.split(',')[1] ?? ''
  return Buffer.from(base64, 'base64')
}

async function uploadCard(args: {
  supabase: SupabaseClient
  demoId: number | null
  storySlug: string
  target: ShareRenderTarget
  pngBuffer: Buffer
  contentRevisionHash: string
}): Promise<string> {
  const safeId = args.target.cardId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const ratioKey = args.target.ratio.replace(':', 'x')
  const storagePath = `${args.storySlug}/share/${safeId}__${ratioKey}.png`

  const { error: uploadErr } = await args.supabase.storage
    .from(SHARE_BUCKET)
    .upload(storagePath, args.pngBuffer, {
      contentType: 'image/png',
      upsert: true,
    })
  if (uploadErr) throw new Error(`upload: ${uploadErr.message}`)

  const { data } = args.supabase.storage.from(SHARE_BUCKET).getPublicUrl(storagePath)
  const publicUrl = data.publicUrl

  const { error: dbErr } = await args.supabase.from('story_share_assets').upsert(
    {
      story_slug: args.storySlug,
      demo_id: args.demoId,
      card_id: args.target.cardId,
      ratio: args.target.ratio,
      storage_path: storagePath,
      public_url: publicUrl,
      content_revision_hash: args.contentRevisionHash,
      dispatched_at: null,
    },
    { onConflict: 'story_slug,card_id,ratio' }
  )
  if (dbErr) throw new Error(`db upsert: ${dbErr.message}`)
  return publicUrl
}

export async function renderShareAssets(args: {
  supabase: SupabaseClient
  storySlug: string
  baseUrl: string
  cardIds: string[]
  contentRevisionHash: string
  /** Restrict to a subset of ratios. Defaults to all three. */
  ratios?: readonly ShareRatio[]
  /** Optional annotation: which demo (if any) triggered this render. */
  demoId?: number | null
  log?: (m: string) => void
}): Promise<ShareRenderResult> {
  const log = args.log ?? (() => {})
  const result: ShareRenderResult = { rendered: 0, skipped: 0, errors: [] }
  if (args.cardIds.length === 0) return result
  const ratios = args.ratios ?? SHARE_RATIOS

  const browser = await chromium.launch({
    args: ['--disable-blink-features=AutomationControlled'],
  })

  try {
    // The share page is public, but pre-applying the admin cookie costs
    // nothing and future-proofs against later gating.
    const adminToken = expectedToken()
    const cookieUrl = new URL(args.baseUrl)

    // One context per ratio so the viewport stays consistent across all
    // cards at that ratio. Cards re-render when ratio changes.
    for (const ratio of ratios) {
      log(`ratio ${ratio}`)
      const context = await browser.newContext({
        viewport: VIEWPORT_FOR_RATIO[ratio],
        deviceScaleFactor: 2, // retina-quality PNG
        reducedMotion: 'no-preference',
      })
      if (adminToken) {
        await context.addCookies([
          {
            name: ADMIN_COOKIE_NAME,
            value: adminToken,
            domain: cookieUrl.hostname,
            path: '/',
            httpOnly: true,
            secure: cookieUrl.protocol === 'https:',
            sameSite: 'Lax',
          },
        ])
      }
      const page = await context.newPage()
      const url = `${args.baseUrl}/story/${args.storySlug}/share?ratio=${encodeURIComponent(ratio)}`
      log(`  goto: ${url}`)
      await page.goto(url, { waitUntil: 'load', timeout: 60_000 })

      try {
        await page.waitForFunction(
          () => (window as unknown as { __shareReady__?: boolean }).__shareReady__ === true,
          { timeout: READY_TIMEOUT_MS }
        )
      } catch (err) {
        log(`  share ready timeout: ${err instanceof Error ? err.message : err}`)
        await context.close()
        continue
      }

      // Allow font + map + chart entrance animations to settle.
      await page.waitForTimeout(1500)

      for (const cardId of args.cardIds) {
        const target: ShareRenderTarget = { cardId, ratio }
        try {
          const png = await captureOne(page, target, log)
          await uploadCard({
            supabase: args.supabase,
            demoId: args.demoId ?? null,
            storySlug: args.storySlug,
            target,
            pngBuffer: png,
            contentRevisionHash: args.contentRevisionHash,
          })
          result.rendered += 1
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          log(`  ✗ ${cardId} @ ${ratio}: ${message}`)
          result.errors.push({ target, message })
          result.skipped += 1
        }
      }

      await context.close()
    }
  } finally {
    await browser.close()
  }

  return result
}
