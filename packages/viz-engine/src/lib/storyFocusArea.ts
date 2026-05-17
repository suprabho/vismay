/**
 * Shared focal-area config for the story map.
 *
 * The story renders the Mapbox map full-viewport but reserves part of the
 * screen for overlay content (headline + caption in landscape, top text in
 * portrait). To keep the camera's geographic `center` anchored inside the
 * remaining visible region, we apply Mapbox's `padding` option using these
 * fractional rectangles — see `computeStoryFocusPadding` below.
 *
 * Both the story renderer (`StoryMapShell`/`MapboxBackground`) and the
 * admin editors (`MapPickerModal`, `MapEditShell`) import these constants
 * so the WYSIWYG previews stay aligned with the live story.
 */
export type StoryFocusArea = {
  top: number
  left: number
  width: number
  height: number
}

export const STORY_LANDSCAPE_FOCUS_AREA: StoryFocusArea = {
  top: 0.4,
  left: 0,
  width: 0.37,
  height: 0.8,
}

export const STORY_PORTRAIT_FOCUS_AREA: StoryFocusArea = {
  top: 0.25,
  left: 0,
  width: 1.0,
  height: 0.45,
}

/**
 * Convert a fractional focus area into Mapbox `padding` (in px). Mapbox
 * treats padding as the area NOT used by the camera — so to anchor the
 * focal point in (e.g.) the bottom-left 37%×60% box, we pad away the
 * complementary regions. Picks the landscape vs portrait area based on
 * the container's actual aspect ratio.
 */
export function computeStoryFocusPadding(
  container: HTMLElement | null,
  landscapeArea?: StoryFocusArea,
  portraitArea?: StoryFocusArea
): { top: number; right: number; bottom: number; left: number } {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!container) return zero
  const w = container.clientWidth
  const h = container.clientHeight
  if (w === 0 || h === 0) return zero
  const area = w / h < 1 ? portraitArea : landscapeArea
  if (!area) return zero
  return {
    left: Math.max(0, area.left * w),
    right: Math.max(0, (1 - area.left - area.width) * w),
    top: Math.max(0, area.top * h),
    bottom: Math.max(0, (1 - area.top - area.height) * h),
  }
}
