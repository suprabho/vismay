/** External links surfaced in the app and required by the store listings. */
export const PRIVACY_URL = 'https://footshorts.com/privacy';

/**
 * The footshorts web deployment: serves the HTML stories listing
 * (`/api/html-stories`) and the stories themselves (`/s/<slug>`). Override with
 * EXPO_PUBLIC_FOOTSHORTS_WEB_URL to point a dev build at a preview deployment.
 */
export const FOOTSHORTS_WEB_ORIGIN = (
  process.env.EXPO_PUBLIC_FOOTSHORTS_WEB_URL || 'https://footshorts.com'
).replace(/\/$/, '');

/** An HTML story's page as the app embeds it: no site header/footer, the app's own back button. */
export function htmlStoryUrl(slug: string): string {
  return `${FOOTSHORTS_WEB_ORIGIN}/s/${encodeURIComponent(slug)}?embed=1`;
}
