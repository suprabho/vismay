'use client';

/**
 * Amplitude analytics for the Footshorts web app.
 *
 * Thin wrapper around the Amplitude Browser SDK (same pattern as
 * apps/vizmaya-fyi/lib/analytics.ts): event names live in
 * `@footshorts/shared/analytics` so web and mobile can't drift, and every
 * helper no-ops until `initAnalytics()` succeeds — so calls during SSR,
 * before init, or without an API key are simply dropped.
 *
 * Init is gated on `NEXT_PUBLIC_AMPLITUDE_API_KEY` — local dev and preview
 * deploys without the key send nothing.
 */
import * as amplitude from '@amplitude/analytics-browser';
import {
  AnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsEventProps,
  type AuthMethod,
  type FeedTab,
  type FollowSource,
} from '@footshorts/shared/analytics';

let initialized = false;

/** Boot Amplitude once on the client. Safe to call repeatedly. */
export function initAnalytics(): void {
  if (initialized || typeof window === 'undefined') return;

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) return;

  amplitude.init(apiKey, {
    // Data residency. Set NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE=EU for the EU stack.
    serverZone: process.env.NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE === 'EU' ? 'EU' : 'US',
    // Autocapture handles the broad strokes (page views across client-side
    // route changes, sessions, marketing attribution, outbound clicks, form
    // interactions). The custom events below layer product meaning on top.
    autocapture: {
      attribution: true,
      pageViews: true,
      sessions: true,
      formInteractions: true,
      fileDownloads: true,
      elementInteractions: true,
    },
  });
  initialized = true;
}

/**
 * Tie events to the Supabase user id (or clear on sign-out) so journeys can
 * be stitched across web and mobile.
 */
export function setAnalyticsUser(userId: string | null): void {
  if (!initialized) return;
  if (userId) {
    amplitude.setUserId(userId);
  } else {
    amplitude.reset();
  }
}

/** Low-level emit. No-ops until `initAnalytics()` has succeeded. */
export function track<E extends AnalyticsEventName>(
  event: E,
  props?: AnalyticsEventProps[E]
): void {
  if (!initialized) return;
  amplitude.track(event, props);
}

/* ─── Named helpers ──────────────────────────────────────────────────────
   Thin, typed wrappers so call sites read as intent, not strings + bags. */

export const trackFeedTabSelected = (tab: FeedTab): void =>
  track(AnalyticsEvent.FeedTabSelected, { tab });

export const trackArticleSeen = (articleId: string, publisher?: string): void =>
  track(AnalyticsEvent.ArticleSeen, { article_id: articleId, publisher });

export const trackArticleSourceOpened = (props: {
  article_id?: string;
  publisher?: string;
  url: string;
}): void => track(AnalyticsEvent.ArticleSourceOpened, props);

export const trackEntityFollowed = (entityId: string, source?: FollowSource): void =>
  track(AnalyticsEvent.EntityFollowed, { entity_id: entityId, source });

export const trackEntityUnfollowed = (entityId: string, source?: FollowSource): void =>
  track(AnalyticsEvent.EntityUnfollowed, { entity_id: entityId, source });

export const trackOnboardingLeaguesSelected = (leaguesCount: number): void =>
  track(AnalyticsEvent.OnboardingLeaguesSelected, { leagues_count: leaguesCount });

export const trackOnboardingCompleted = (teamsCount: number): void =>
  track(AnalyticsEvent.OnboardingCompleted, { teams_count: teamsCount });

export const trackStoryViewerOpened = (props?: {
  start_index?: number;
  group_count?: number;
}): void => track(AnalyticsEvent.StoryViewerOpened, props);

export const trackSignedUp = (method: AuthMethod): void =>
  track(AnalyticsEvent.SignedUp, { method });

export const trackSignedIn = (props?: { method?: AuthMethod; is_new_user?: boolean }): void =>
  track(AnalyticsEvent.SignedIn, props);

export const trackSignedOut = (): void => track(AnalyticsEvent.SignedOut, {});
