/**
 * Pure coordinate transforms between the data convention (0–100 on both axes)
 * and the SVG user space used by the board.
 *
 * The SVG viewBox is the real pitch in metres (105 × 68) so player tokens drawn
 * as `<circle>` stay perfectly round under uniform scaling — a 0–100 square
 * viewBox stretched to a 105:68 box would render them as ellipses.
 */

/** FIFA standard pitch length in metres — the SVG x extent. */
export const PITCH_LENGTH = 105
/** FIFA standard pitch width in metres — the SVG y extent. */
export const PITCH_WIDTH = 68

export interface SvgPoint {
  x: number
  y: number
}

/** Data coordinate (0–100) → SVG metres. */
export function dataToSvg(x: number, y: number): SvgPoint {
  return { x: (x / 100) * PITCH_LENGTH, y: (y / 100) * PITCH_WIDTH }
}

/** SVG metres → data coordinate (0–100). Inverse of {@link dataToSvg}. */
export function svgToData(sx: number, sy: number): SvgPoint {
  return { x: (sx / PITCH_LENGTH) * 100, y: (sy / PITCH_WIDTH) * 100 }
}

/** Convert a list of [x, y] data waypoints into an SVG path `d` string. */
export function pointsToPath(points: readonly [number, number][]): string {
  return points
    .map(([x, y], i) => {
      const p = dataToSvg(x, y)
      return `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
    })
    .join(' ')
}
