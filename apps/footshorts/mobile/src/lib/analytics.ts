/**
 * Amplitude analytics for the Footshorts mobile app.
 *
 * Mirror of `web/lib/analytics.ts`: event names and property shapes come from
 * `@footshorts/shared/analytics` so the two apps report one taxonomy, and
 * every helper no-ops until `initAnalytics()` succeeds — so a build without
 * `EXPO_PUBLIC_AMPLITUDE_API_KEY` (local dev) simply sends nothing.
 *
 * Unlike web (where Amplitude autocaptures page views), native screen views
 * are emitted explicitly as `screen_viewed` by the ScreenTracker in
 * app/_layout.tsx.
 */
import * as amplitude from '@amplitude/analytics-react-native';
import {
  AnalyticsEvent,
  type AnalyticsEventName,
  type AnalyticsEventProps,
  type AuthMethod,
  type FeedTab,
  type FollowSource,
} from '@footshorts/shared/analytics';

let initialized = false;

/** Boot Amplitude once at app start. Safe to call repeatedly. */
export function initAnalytics(): void {
  if (initialized) return;

  const apiKey = process.env.EXPO_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) return;

  amplitude.init(apiKey, undefined, {
    // Data residency. Set EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE=EU for the EU stack.
    serverZone: process.env.EXPO_PUBLIC_AMPLITUDE_SERVER_ZONE === 'EU' ? 'EU' : 'US',
    // Session start/end events, driven by app foreground/background.
    trackingSessionEvents: true,
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

/**
 * Set the durable "signup_method" user property (Identify, not an event) so
 * cohorts can be segmented in Amplitude by how someone joined. `setOnce`
 * keeps the original method even if the same account later re-authenticates
 * via a different provider.
 */
export function setSignupMethod(method: AuthMethod): void {
  if (!initialized) return;
  const identify = new amplitude.Identify().setOnce('signup_method', method);
  amplitude.identify(identify);
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

export const trackScreenViewed = (pathname: string): void =>
  track(AnalyticsEvent.ScreenViewed, { pathname });

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

export const trackSignedIn = (method: AuthMethod): void =>
  track(AnalyticsEvent.SignedIn, { method });

export const trackSignedOut = (): void => track(AnalyticsEvent.SignedOut, {});

export const trackAccountDeleted = (): void => track(AnalyticsEvent.AccountDeleted, {});
