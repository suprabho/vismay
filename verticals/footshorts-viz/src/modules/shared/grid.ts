import type { CSSProperties } from 'react'

/**
 * Shared helpers for the `grid` variant of fs:* modules (match-card, match-tile).
 * Mirrors the matrix that `fs:team-form-strip` already renders: a `columns`-wide
 * grid whose cells are either a uniform fixed width (centered) or stretch to
 * share the row equally.
 */

/** Grid container style — fixed `cardWidth` columns (centered) or equal stretch. */
export function fsGridStyle(columns: number, cardWidth?: number): CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns:
      cardWidth !== undefined
        ? `repeat(${columns}, ${cardWidth}px)`
        : `repeat(${columns}, minmax(0, 1fr))`,
    gap: '0.75rem',
    // Centre fixed-width columns; let auto columns span the full width.
    justifyContent: cardWidth !== undefined ? 'center' : 'stretch',
  }
}

/**
 * Caps a grid to the first `rows × columns` items when `rows` is set. Items are
 * shown in author order, so we keep the leading ones (unlike team-form-strip,
 * which keeps the most-recent tail of an oldest→newest fixture list).
 */
export function capToGrid<T>(items: T[], columns: number, rows?: number): T[] {
  return rows !== undefined && rows > 0 ? items.slice(0, rows * columns) : items
}

/** Validates an optional positive integer config field (columns / rows). */
export function parsePositiveInt(raw: unknown, field: string, label: string): number | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
    throw new Error(`${label}: '${field}' must be a positive integer`)
  }
  return raw
}

/** Validates an optional positive number config field (cardWidth, in px). */
export function parsePositiveNumber(raw: unknown, field: string, label: string): number | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    throw new Error(`${label}: '${field}' must be a positive number (pixels)`)
  }
  return raw
}
