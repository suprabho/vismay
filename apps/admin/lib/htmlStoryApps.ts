/**
 * Where each app's HTML stories live, from admin's point of view: the public
 * site they are served from (for "Live at" links and the brief's posting
 * instructions) and the admin section that manages them. vizmaya keeps its
 * static /vizmaya tree; every other hosting app sits under the dynamic
 * /[appSlug] section.
 *
 * Client-safe: only static NEXT_PUBLIC_* reads via publicSite.
 */

import { HTML_STORY_APPS, type HtmlStoryApp } from '@vismay/html-stories/apps'
import { footshortsPublicUrl, vizmayaPublicUrl } from '@/lib/publicSite'

export { HTML_STORY_APPS, type HtmlStoryApp }

export function htmlStorySiteUrl(app: HtmlStoryApp): string {
  return app === 'footshorts' ? footshortsPublicUrl : vizmayaPublicUrl
}

/** The admin section that manages this app's HTML stories, e.g. /footshorts/html-stories. */
export function htmlStoriesBasePath(app: HtmlStoryApp): string {
  return app === 'vizmaya-fyi' ? '/vizmaya/html-stories' : `/${app}/html-stories`
}

/** The admin route slug (`/vizmaya`, `/footshorts`) → the hosting app, or null. */
export function htmlStoryAppForSection(appSlug: string): HtmlStoryApp | null {
  if (appSlug === 'vizmaya') return 'vizmaya-fyi'
  return (HTML_STORY_APPS as readonly string[]).includes(appSlug) ? (appSlug as HtmlStoryApp) : null
}
