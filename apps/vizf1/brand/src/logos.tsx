/**
 * VizF1 logo marks — inline SVG React components.
 *
 * Source of truth: Figma "Vismay Brands" file, node 120-196 (VizF1 section).
 * All linework is `currentColor` so marks tint with the surrounding text
 * color (off-white in the app header, neutral grays in admin chrome). The
 * checker-gradient texture is expressed as `fillOpacity` steps (0.2/0.5) of
 * currentColor, matching the design's black-opacity stack.
 *
 * Deliberately directive-free (no 'use client', no hooks) so these render in
 * server components and `next/og` ImageResponse alike. No Tailwind classes in
 * here either — sizing comes from the caller's `className`/props — which
 * keeps this file out of every consumer app's `@source` scan list.
 *
 * A plain-string sibling of `ChequeredFlagMark` lives in
 * packages/verticals/src/data.ts (`APPS` → vizf1 `branding.logoSvg`) for
 * consumers that can't import React components; keep the geometry in sync.
 */

import type { SVGProps } from 'react'

export interface LogoProps extends SVGProps<SVGSVGElement> {
  /** Accessible name. Omitted → the mark is aria-hidden (decorative). */
  title?: string
}

function a11y(title?: string) {
  return title ? { role: 'img' as const } : { 'aria-hidden': true as const }
}

/** Chequered flag mark, flat colorway — every shape at full currentColor. */
export function ChequeredFlagMark({ title, ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 406.319 238.021" fill="none" xmlns="http://www.w3.org/2000/svg" {...a11y(title)} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M12.0213 226L108.191 129.83" stroke="currentColor" strokeWidth="24.0426" strokeLinecap="round" />
      <path d="M146.66 115.404H103.383L114.525 104.792C133.302 86.9103 158.237 76.9362 184.166 76.9362H204.362L176.505 103.466C168.459 111.13 157.772 115.404 146.66 115.404Z" fill="currentColor" />
      <path d="M242.83 76.9362H199.553L227.409 50.4065C235.456 42.7427 246.143 38.4681 257.255 38.4681H300.532L272.676 64.9978C264.629 72.6615 253.942 76.9362 242.83 76.9362Z" fill="currentColor" />
      <path d="M276.489 115.404H223.596L257.936 82.6995C261.82 78.9998 266.98 76.9362 272.345 76.9362H276.491C293.853 76.9362 302.327 98.124 289.754 110.098C286.178 113.504 281.428 115.404 276.489 115.404Z" fill="currentColor" />
      <path d="M222.634 38.4681H175.511C201.44 13.7738 235.874 0 271.681 0H276.489L245.848 29.1827C239.589 35.1434 231.277 38.4681 222.634 38.4681Z" fill="currentColor" />
      <path d="M165.405 153.872H163.873C148.976 153.872 141.705 135.693 152.492 125.42C159.243 118.99 168.208 115.404 177.531 115.404H223.596L196.094 141.597C187.819 149.477 176.831 153.872 165.405 153.872Z" fill="currentColor" />
      <path d="M344.77 38.4681H305.34L330.411 14.5913C340.246 5.22456 353.308 0 366.889 0H406.319L381.249 23.8767C371.413 33.2435 358.352 38.4681 344.77 38.4681Z" fill="currentColor" />
    </svg>
  )
}

/** Chequered flag mark, gradient colorway — checker leaves fade via opacity steps. */
export function ChequeredFlagMarkGradient({ title, ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 345.192 202.213" fill="none" xmlns="http://www.w3.org/2000/svg" {...a11y(title)} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M10.2128 192L91.9149 110.298" stroke="currentColor" strokeWidth="20.4255" strokeLinecap="round" />
      <path d="M124.596 98.0425H87.8298L97.296 89.0271C113.247 73.8353 134.431 65.3617 156.46 65.3617H173.617L149.952 87.9002C143.115 94.411 134.036 98.0425 124.596 98.0425Z" fill="currentColor" />
      <path d="M206.298 65.3617H169.532L193.197 42.8232C200.034 36.3124 209.113 32.6808 218.553 32.6808H255.319L231.654 55.2194C224.817 61.7301 215.738 65.3617 206.298 65.3617Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M234.894 98.0425H189.957L219.131 70.258C222.432 67.1149 226.815 65.3617 231.373 65.3617H234.895C249.645 65.3617 256.844 83.362 246.163 93.5348C243.125 96.4285 239.089 98.0425 234.894 98.0425Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M189.14 32.6809H149.106C171.135 11.7017 200.389 0 230.809 0H234.894L208.862 24.7924C203.544 29.8563 196.483 32.6809 189.14 32.6809Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M140.521 130.723H139.22C126.564 130.723 120.386 115.279 129.551 106.551C135.286 101.089 142.903 98.0425 150.823 98.0425H189.957L166.593 120.295C159.563 126.989 150.228 130.723 140.521 130.723Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M292.902 32.6809H259.404L280.703 12.3962C289.059 4.43856 300.155 0 311.694 0H345.192L323.893 20.2847C315.537 28.2423 304.441 32.6809 292.902 32.6809Z" fill="currentColor" fillOpacity="0.5" />
    </svg>
  )
}

/** VF1 monogram, flat — V and F1 share one baseline. The header wordmark. */
export function VF1MonogramFlat({ title, ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 188 55" fill="none" xmlns="http://www.w3.org/2000/svg" {...a11y(title)} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M2.5 2.5H19.6837C25.3435 2.5 29.2135 8.21621 27.1115 13.4711L11.5 52.5L51.8345 12.1655C58.0232 5.97678 66.4169 2.5 75.169 2.5H111.5L61.5 52.5H101.5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5 52.5L41.5 32.5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M49.5 29.5H40.5L42.8172 27.2931C46.722 23.5743 51.9077 21.5 57.3 21.5H61.5L55.7069 27.0172C54.0334 28.611 51.811 29.5 49.5 29.5Z" fill="currentColor" />
      <path d="M69.5 21.5H60.5L66.2931 15.9828C67.9666 14.389 70.189 13.5 72.5 13.5H81.5L75.7069 19.0172C74.0334 20.611 71.811 21.5 69.5 21.5Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M76.5 29.5H65.5L72.6415 22.6986C73.4494 21.9292 74.5224 21.5 75.6381 21.5H76.5003C80.1111 21.5 81.8734 25.9063 79.2586 28.3966C78.5149 29.1049 77.5271 29.5 76.5 29.5Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M65.3 13.5H55.5C60.8923 8.36447 68.0535 5.5 75.5 5.5H76.5L70.1276 11.569C68.826 12.8086 67.0974 13.5 65.3 13.5Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M53.3983 37.5H53.0799C49.9818 37.5 48.4696 33.7194 50.713 31.5828C52.1169 30.2458 53.9814 29.5 55.9201 29.5H65.5L59.7805 34.9471C58.0598 36.5859 55.7746 37.5 53.3983 37.5Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M90.7 13.5H82.5L87.7138 8.53448C89.7592 6.58652 92.4755 5.5 95.3 5.5H103.5L98.2862 10.4655C96.2408 12.4135 93.5245 13.5 90.7 13.5Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M106.222 19.937L81.5 44.5H106.937L121.317 30.85H132.891L142.01 23.361H127.981L142.01 9.85H168.471C170.128 9.85 171.471 11.1931 171.471 12.85V52.5H185.5V2.5H163.083H148.511C132.665 2.5 117.463 8.7684 106.222 19.937Z" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** VF1 monogram, staggered — F1 drops below the V's baseline. Display contexts. */
export function VF1Monogram({ title, ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 182 78" fill="none" xmlns="http://www.w3.org/2000/svg" {...a11y(title)} {...props}>
      {title ? <title>{title}</title> : null}
      <path d="M2.5 2.5H19.6837C25.3435 2.5 29.2135 8.21621 27.1115 13.4711L11.5 52.5L51.8345 12.1655C58.0232 5.97678 66.4169 2.5 75.169 2.5H111.5L61.5 52.5H101.5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21.5 52.5L41.5 32.5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M49.5 29.5H40.5L42.8172 27.2931C46.722 23.5743 51.9077 21.5 57.3 21.5H61.5L55.7069 27.0172C54.0334 28.611 51.811 29.5 49.5 29.5Z" fill="currentColor" />
      <path d="M69.5 21.5H60.5L66.2931 15.9828C67.9666 14.389 70.189 13.5 72.5 13.5H81.5L75.7069 19.0172C74.0334 20.611 71.811 21.5 69.5 21.5Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M76.5 29.5H65.5L72.6415 22.6986C73.4494 21.9292 74.5224 21.5 75.6381 21.5H76.5003C80.1111 21.5 81.8734 25.9063 79.2586 28.3966C78.5149 29.1049 77.5271 29.5 76.5 29.5Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M65.3 13.5H55.5C60.8923 8.36447 68.0535 5.5 75.5 5.5H76.5L70.1276 11.569C68.826 12.8086 67.0974 13.5 65.3 13.5Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M53.3983 37.5H53.0799C49.9818 37.5 48.4696 33.7194 50.713 31.5828C52.1169 30.2458 53.9814 29.5 55.9201 29.5H65.5L59.7805 34.9471C58.0598 36.5859 55.7746 37.5 53.3983 37.5Z" fill="currentColor" fillOpacity="0.2" />
      <path d="M90.7 13.5H82.5L87.7138 8.53448C89.7592 6.58652 92.4755 5.5 95.3 5.5H103.5L98.2862 10.4655C96.2408 12.4135 93.5245 13.5 90.7 13.5Z" fill="currentColor" fillOpacity="0.5" />
      <path d="M88.357 42.9044L55.5 75.5H85.8286L102.974 59.25H116.774L127.646 50.3346H110.919L127.646 34.25H159.773C161.43 34.25 162.773 35.5931 162.773 37.25V75.5H179.5V25.5H152.772H130.614C114.784 25.5 99.5951 31.7558 88.357 42.9044Z" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
