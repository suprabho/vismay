/**
 * Amplitude analytics for vizmaya.fyi.
 *
 * One small wrapper around the Amplitude Browser SDK so every call site stays
 * unconditional and typed, and so the event names live in exactly one place.
 *
 * Init is gated so we only measure genuine visitor sessions:
 *   - no `NEXT_PUBLIC_AMPLITUDE_API_KEY`  → no-op (local dev, preview deploys)
 *   - `?capture=1`                        → headless video/PDF render (Playwright)
 *   - `?embed=1`                          → story loaded in a host iframe (home studio embed)
 *   - `?autoplay=1`                       → the autoplay render surface (also an iframe)
 *
 * `track()` itself no-ops until `initAnalytics()` succeeds, so events fired
 * during SSR, before init, or on a gated surface are simply dropped rather
 * than queued.
 */
import * as amplitude from '@amplitude/analytics-browser'

let initialized = false

/** Boot Amplitude once on the client. Safe to call repeatedly. */
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY
  if (!apiKey) return

  // Skip headless render pipelines and iframe surfaces — they reload story
  // URLs and would otherwise inflate page views and sessions with traffic that
  // isn't a real reader.
  const params = new URLSearchParams(window.location.search)
  if (
    params.get('capture') === '1' ||
    params.get('embed') === '1' ||
    params.get('autoplay') === '1'
  ) {
    return
  }

  amplitude.init(apiKey, {
    // Data residency. Set NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE=EU for the EU stack.
    serverZone: process.env.NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE === 'EU' ? 'EU' : 'US',
    // Autocapture handles the broad strokes (page views across client-side
    // route changes, sessions, marketing attribution, outbound/file-download
    // clicks, form interactions). The custom events below layer product
    // meaning on top.
    autocapture: {
      attribution: true,
      pageViews: true,
      sessions: true,
      formInteractions: true,
      fileDownloads: true,
      elementInteractions: true,
    },
  })
  initialized = true
}

/**
 * Custom event names. Centralised so dashboards, the call sites, and any
 * downstream typing can't drift apart.
 */
export const AnalyticsEvent = {
  StoryViewed: 'story_viewed',
  StorySectionViewed: 'story_section_viewed',
  StoryCompleted: 'story_completed',
  TopicFiltered: 'topic_filtered',
  ShareCardDownloaded: 'share_card_downloaded',
  ShareCardsDownloadedAll: 'share_cards_downloaded_all',
  AutoplayStarted: 'autoplay_started',
  AutoplayVideoDownloaded: 'autoplay_video_downloaded',
  StoryPdfExported: 'story_pdf_exported',
} as const

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]

type EventProps = Record<string, string | number | boolean | undefined>

/** Low-level emit. No-ops until `initAnalytics()` has succeeded. */
export function track(event: AnalyticsEventName, props?: EventProps): void {
  if (!initialized) return
  amplitude.track(event, props)
}

/* ─── Named helpers ──────────────────────────────────────────────────────
   Thin, typed wrappers so call sites read as intent, not strings + bags. */

export const trackStoryViewed = (
  slug: string,
  props?: { format?: string; totalSections?: number }
): void => track(AnalyticsEvent.StoryViewed, { slug, ...props })

export const trackStorySectionViewed = (
  slug: string,
  milestone: number,
  props?: { sectionIndex?: number; totalSections?: number }
): void => track(AnalyticsEvent.StorySectionViewed, { slug, milestone, ...props })

export const trackStoryCompleted = (
  slug: string,
  props?: { totalSections?: number }
): void => track(AnalyticsEvent.StoryCompleted, { slug, ...props })

export const trackTopicFiltered = (topic: string): void =>
  track(AnalyticsEvent.TopicFiltered, { topic })

export const trackShareCardDownloaded = (
  slug: string,
  props?: { variant?: string; ratio?: string; index?: number }
): void => track(AnalyticsEvent.ShareCardDownloaded, { slug, ...props })

export const trackShareCardsDownloadedAll = (
  slug: string,
  props?: { count?: number; ratio?: string }
): void => track(AnalyticsEvent.ShareCardsDownloadedAll, { slug, ...props })

export const trackAutoplayStarted = (
  slug: string,
  props?: { aspect?: string }
): void => track(AnalyticsEvent.AutoplayStarted, { slug, ...props })

export const trackAutoplayVideoDownloaded = (
  slug: string,
  props?: { aspect?: string }
): void => track(AnalyticsEvent.AutoplayVideoDownloaded, { slug, ...props })

export const trackStoryPdfExported = (
  slug: string,
  props?: { format?: string }
): void => track(AnalyticsEvent.StoryPdfExported, { slug, ...props })
