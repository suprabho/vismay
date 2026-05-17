/**
 * Surgically update map.center/zoom/pitch/bearing inside a section's raw YAML
 * without re-serializing. Preserves comments, quoting, and every other key
 * (pins, regions, heatmap, opacity, etc.).
 *
 * The section YAML looks like:
 *   - id: hero
 *     kind: hero
 *     map:
 *       center: [10.0, 20.0]
 *       zoom: 1.7
 *       pitch: 0
 *       bearing: 0
 *       opacity: 0.45
 *       mobile:
 *         center: [12.0, 18.0]
 *         zoom: 2.4
 */

export interface MapView {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
}

export function extractMapView(sectionRaw: string): MapView | null {
  const center = matchCenter(sectionRaw)
  const zoom = matchNum(sectionRaw, 'zoom')
  if (!center || zoom == null) return null
  return {
    center,
    zoom,
    pitch: matchNum(sectionRaw, 'pitch') ?? 0,
    bearing: matchNum(sectionRaw, 'bearing') ?? 0,
  }
}

/**
 * Return the section YAML with center/zoom/pitch/bearing updated. Only
 * touches values under `map:`. If a key isn't present in the source, it's
 * inserted at the end of the map block.
 */
export function applyMapView(sectionRaw: string, view: MapView): string {
  let next = sectionRaw

  next = replaceOrInsert(
    next,
    'center',
    `[${round(view.center[0], 4)}, ${round(view.center[1], 4)}]`,
    'map'
  )
  next = replaceOrInsert(next, 'zoom', round(view.zoom, 2).toString(), 'map')
  next = replaceOrInsert(next, 'pitch', round(view.pitch, 1).toString(), 'map')
  next = replaceOrInsert(next, 'bearing', round(view.bearing, 1).toString(), 'map')

  return next
}

/**
 * Read the mobile-only map override (`map.mobile.{center,zoom,pitch,bearing}`).
 * Returns null when the section has no map block, no `mobile:` sub-block, or
 * either of the required fields (center, zoom) is missing.
 */
export function extractMobileMapView(sectionRaw: string): MapView | null {
  const map = findMapBlock(sectionRaw)
  if (!map) return null
  const mob = findMobileBlock(sectionRaw, map)
  if (!mob) return null
  const slice = sliceLines(sectionRaw, mob.startLine, mob.endLine)
  const center = matchCenter(slice)
  const zoom = matchNum(slice, 'zoom')
  if (!center || zoom == null) return null
  return {
    center,
    zoom,
    pitch: matchNum(slice, 'pitch') ?? 0,
    bearing: matchNum(slice, 'bearing') ?? 0,
  }
}

/**
 * Splice center/zoom/pitch/bearing into the `map.mobile:` sub-block. Creates
 * the sub-block if it doesn't exist. Requires the section to already have a
 * `map:` block (caller's job to ensure this — desktop mode always does).
 */
export function applyMobileMapView(sectionRaw: string, view: MapView): string {
  const map = findMapBlock(sectionRaw)
  if (!map) return sectionRaw

  const mob = findMobileBlock(sectionRaw, map)
  const lines = sectionRaw.split('\n')
  const mobileIndent = ' '.repeat(map.mapIndent + 2)
  const childIndent = ' '.repeat(map.mapIndent + 4)

  if (!mob) {
    // Insert a fresh mobile block at the end of the map block.
    const newBlock = [
      `${mobileIndent}mobile:`,
      `${childIndent}center: [${round(view.center[0], 4)}, ${round(view.center[1], 4)}]`,
      `${childIndent}zoom: ${round(view.zoom, 2)}`,
      `${childIndent}pitch: ${round(view.pitch, 1)}`,
      `${childIndent}bearing: ${round(view.bearing, 1)}`,
    ]
    lines.splice(map.endLine, 0, ...newBlock)
    return lines.join('\n')
  }

  // Patch existing mobile block by operating on its slice, then splice back.
  const slice = lines.slice(mob.startLine, mob.endLine).join('\n')
  let updated = slice
  updated = replaceOrInsert(
    updated,
    'center',
    `[${round(view.center[0], 4)}, ${round(view.center[1], 4)}]`,
    'mobile'
  )
  updated = replaceOrInsert(updated, 'zoom', round(view.zoom, 2).toString(), 'mobile')
  updated = replaceOrInsert(updated, 'pitch', round(view.pitch, 1).toString(), 'mobile')
  updated = replaceOrInsert(updated, 'bearing', round(view.bearing, 1).toString(), 'mobile')

  const before = lines.slice(0, mob.startLine)
  const after = lines.slice(mob.endLine)
  return [...before, ...updated.split('\n'), ...after].join('\n')
}

/**
 * Remove the entire `map.mobile:` sub-block (the `mobile:` line plus all of
 * its children). No-op if the block isn't present.
 */
export function removeMobileMapView(sectionRaw: string): string {
  const map = findMapBlock(sectionRaw)
  if (!map) return sectionRaw
  const mob = findMobileBlock(sectionRaw, map)
  if (!mob) return sectionRaw
  const lines = sectionRaw.split('\n')
  lines.splice(mob.startLine, mob.endLine - mob.startLine)
  return lines.join('\n')
}

/* ─────────── internals ─────────── */

interface MapBlockBounds {
  startLine: number // line of "map:"
  endLine: number // exclusive — first line outside the map block
  mapIndent: number // indent depth of the "map:" line itself
}

interface MobileBlockBounds {
  startLine: number // line of "mobile:"
  endLine: number // exclusive
}

function findMapBlock(raw: string): MapBlockBounds | null {
  const lines = raw.split('\n')
  let mapLine = -1
  let mapIndent = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)map:\s*$/)
    if (m) {
      mapLine = i
      mapIndent = m[1].length
      break
    }
  }
  if (mapLine < 0) return null
  let endLine = lines.length
  for (let i = mapLine + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)\S/)
    if (m && m[1].length <= mapIndent) {
      endLine = i
      break
    }
  }
  return { startLine: mapLine, endLine, mapIndent }
}

function findMobileBlock(raw: string, map: MapBlockBounds): MobileBlockBounds | null {
  const lines = raw.split('\n')
  const mobileIndent = map.mapIndent + 2
  let mobileLine = -1
  for (let i = map.startLine + 1; i < map.endLine; i++) {
    const m = lines[i].match(/^(\s*)mobile:\s*$/)
    if (m && m[1].length === mobileIndent) {
      mobileLine = i
      break
    }
  }
  if (mobileLine < 0) return null
  let endLine = map.endLine
  for (let i = mobileLine + 1; i < map.endLine; i++) {
    const m = lines[i].match(/^(\s*)\S/)
    if (m && m[1].length <= mobileIndent) {
      endLine = i
      break
    }
  }
  return { startLine: mobileLine, endLine }
}

function sliceLines(raw: string, start: number, end: number): string {
  return raw.split('\n').slice(start, end).join('\n')
}

function matchCenter(raw: string): [number, number] | null {
  const m = raw.match(/^\s*center:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/m)
  if (!m) return null
  return [parseFloat(m[1]), parseFloat(m[2])]
}

function matchNum(raw: string, key: string): number | null {
  const re = new RegExp(`^\\s*${key}:\\s*(-?\\d+(?:\\.\\d+)?)\\b`, 'm')
  const m = raw.match(re)
  return m ? parseFloat(m[1]) : null
}

function replaceOrInsert(raw: string, key: string, newValue: string, parentKey: string): string {
  if (key === 'center') {
    const re = /^(\s*)center:\s*\[.*?\]\s*$/m
    if (re.test(raw)) return raw.replace(re, `$1center: ${newValue}`)
    return insertUnderParent(raw, key, newValue, parentKey)
  }
  const re = new RegExp(`^(\\s*)${key}:\\s*-?\\d+(?:\\.\\d+)?\\s*$`, 'm')
  if (re.test(raw)) return raw.replace(re, `$1${key}: ${newValue}`)
  return insertUnderParent(raw, key, newValue, parentKey)
}

function insertUnderParent(raw: string, key: string, value: string, parentKey: string): string {
  const re = new RegExp(`^\\s*${parentKey}:\\s*$`, 'm')
  const lines = raw.split('\n')
  let parentLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      parentLine = i
      break
    }
  }
  if (parentLine < 0) return raw
  const parentIndent = (lines[parentLine].match(/^(\s*)/)?.[1] ?? '').length
  const childIndent = ' '.repeat(parentIndent + 2)
  let insertAt = lines.length
  for (let i = parentLine + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)\S/)
    if (m && m[1].length <= parentIndent) {
      insertAt = i
      break
    }
  }
  lines.splice(insertAt, 0, `${childIndent}${key}: ${value}`)
  return lines.join('\n')
}

function round(n: number, places: number): number {
  const p = Math.pow(10, places)
  return Math.round(n * p) / p
}
