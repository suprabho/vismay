/**
 * Amplitude event contract shared by the web and mobile apps.
 *
 * Names and property shapes live here so the two apps (and any dashboard
 * built on top) can't drift apart. Each app owns its own SDK wrapper
 * (`web/lib/analytics.ts`, `mobile/src/lib/analytics.ts`) — this module is
 * deliberately dependency-free.
 *
 * Conventions:
 *   - event names are snake_case, past tense ("what happened")
 *   - property keys are snake_case
 *   - page/screen views are NOT custom events: web relies on Amplitude
 *     autocapture page views, mobile emits `screen_viewed` from the router
 */

export const AnalyticsEvent = {
  /** Pill-tab switch on the feed screen (forYou | discover | editorial). */
  FeedTabSelected: 'feed_tab_selected',
  /** An article card was actually read (≥60–80% visible past the dwell threshold). */
  ArticleSeen: 'article_seen',
  /** "Read at source" — the user left for the publisher's page. */
  ArticleSourceOpened: 'article_source_opened',
  /** A league/team/player was followed. */
  EntityFollowed: 'entity_followed',
  /** A league/team/player was unfollowed. */
  EntityUnfollowed: 'entity_unfollowed',
  /** Onboarding step 1 — leagues picked, moving on to teams. */
  OnboardingLeaguesSelected: 'onboarding_leagues_selected',
  /** Onboarding finished (profile stamped with onboarded_at). */
  OnboardingCompleted: 'onboarding_completed',
  /** The stories (rings) viewer was opened. */
  StoryViewerOpened: 'story_viewer_opened',
  /** Mobile-only: a router screen became active (web uses autocaptured page views). */
  ScreenViewed: 'screen_viewed',
  /** Auth lifecycle. `method` is password | google | apple. */
  SignedUp: 'signed_up',
  SignedIn: 'signed_in',
  SignedOut: 'signed_out',
  AccountDeleted: 'account_deleted',
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent];

export type FeedTab = 'forYou' | 'discover' | 'editorial';

export type AuthMethod = 'password' | 'google' | 'apple';

/** Where a follow/unfollow was performed. */
export type FollowSource = 'onboarding' | 'following';

/** Typed property bags per event, so both apps' helpers agree on shapes. */
export type AnalyticsEventProps = {
  [AnalyticsEvent.FeedTabSelected]: { tab: FeedTab };
  [AnalyticsEvent.ArticleSeen]: { article_id: string; publisher?: string };
  [AnalyticsEvent.ArticleSourceOpened]: {
    article_id?: string;
    publisher?: string;
    url: string;
  };
  [AnalyticsEvent.EntityFollowed]: { entity_id: string; source?: FollowSource };
  [AnalyticsEvent.EntityUnfollowed]: { entity_id: string; source?: FollowSource };
  [AnalyticsEvent.OnboardingLeaguesSelected]: { leagues_count: number };
  [AnalyticsEvent.OnboardingCompleted]: { teams_count: number };
  [AnalyticsEvent.StoryViewerOpened]: { start_index?: number; group_count?: number };
  [AnalyticsEvent.ScreenViewed]: { pathname: string };
  [AnalyticsEvent.SignedUp]: { method: AuthMethod };
  [AnalyticsEvent.SignedIn]: { method?: AuthMethod; is_new_user?: boolean };
  [AnalyticsEvent.SignedOut]: Record<string, never>;
  [AnalyticsEvent.AccountDeleted]: Record<string, never>;
};
