/** Seeded randomness for the draw: the same seed and history always give the same spin. */

export type Rng = () => number

/** mulberry32: small, fast, good enough for a slot machine. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed(): number {
  return (Math.random() * 4294967296) >>> 0
}

export function seedHex(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, '0')
}

export function parseSeed(hex: string): number | null {
  return /^[0-9a-f]{1,8}$/i.test(hex) ? parseInt(hex, 16) >>> 0 : null
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  if (!items.length) throw new Error('pick from an empty list')
  return items[Math.floor(rng() * items.length) % items.length]!
}

export function weighted<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T {
  const total = items.reduce((s, x) => s + Math.max(0, weight(x)), 0)
  if (total <= 0) return pick(items, rng)
  let r = rng() * total
  for (const item of items) {
    r -= Math.max(0, weight(item))
    if (r <= 0) return item
  }
  return items[items.length - 1]!
}

export function uniq<T>(items: readonly T[]): T[] {
  return Array.from(new Set(items))
}
