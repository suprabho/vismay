import type { CSSProperties } from 'react'

/**
 * Shared entrance animation for scrapbook layers — items "settle onto the
 * desk" when a spread becomes active. Foreground layers remount per snap unit,
 * so the animation replays on every page turn; `delay` staggers siblings.
 *
 * The `travel-enter` keyframes ship in the travel app's globals.css. In a host
 * without them the animation shorthand simply no-ops (content stays visible
 * because the keyframes' `both` fill never applies without a definition).
 */
export function enterStyle(delay?: number): CSSProperties {
  return {
    animation: 'travel-enter 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
    animationDelay: `${Math.max(0, delay ?? 0)}ms`,
  }
}
