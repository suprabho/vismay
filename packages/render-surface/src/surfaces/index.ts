/**
 * Surface entry components — async server components that encapsulate each
 * headless render route's body (data fetch + brand + ThemeProvider +
 * VerticalLoader + shell), parameterised so a host app passes only
 * environment/branding (adminBaseUrl, mapboxToken, the app's MapPickerModal).
 *
 * Route segment config (`dynamic`, `generateStaticParams`) is NOT here — it
 * must be exported from the route file, so host pages own it and render these.
 */
export { ShareSurface, type ShareSurfaceProps } from './ShareSurface'
export { ReportSurface, type ReportSurfaceProps } from './ReportSurface'
export { SlidesSurface, type SlidesSurfaceProps } from './SlidesSurface'
export { AutoplaySurface, type AutoplaySurfaceProps } from './AutoplaySurface'
export {
  CanvasFrameSurface,
  type CanvasFrameSurfaceProps,
} from './CanvasFrameSurface'
