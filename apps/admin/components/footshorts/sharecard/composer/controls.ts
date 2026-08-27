/** Shared control styles + helpers for the footshorts share-card composer
 *  panels. Mirrors the inline classes the creator already used so the icon-rail
 *  panels read consistently. */

export const labelCls = 'block text-[11px] font-medium text-neutral-400'
export const inputCls =
  'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30'
export const selectCls = inputCls

/** Coerce a CSS color to 6-digit hex for the native color input (which only
 *  accepts #rrggbb): expand 3-digit hex, pass 6-digit through, else fall back. */
export function toHex6(v: string): string {
  const s = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  const m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return `#${m[1].split('').map((c) => c + c).join('')}`
  return '#000000'
}
