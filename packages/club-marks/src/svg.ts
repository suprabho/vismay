import { optimize, type CustomPlugin, type XastElement, type XastParent } from 'svgo'
import { ClubMarkError } from './types'

/**
 * SVG cleaning (spec step 2): SVGO plus an element/attribute allow-list. No
 * scripts, `on*` handlers, `foreignObject` or external references survive;
 * `<image>` is kept only as an embedded data: raster (the crest is then treated
 * as a raster). Text is kept but reported, since it cannot be outlined here.
 */

const ALLOWED = new Set([
  'svg', 'g', 'switch', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'pattern', 'title', 'desc', 'style',
  'text', 'tspan', 'textPath', 'image', 'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite',
  'feFlood', 'feGaussianBlur', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'feFuncA', 'feFuncR', 'feFuncG', 'feFuncB',
])
const HREF = /^(xlink:)?href$/
const LOCAL_REF = /^\s*#/
const DATA_RASTER = /^\s*data:image\/(png|jpe?g|webp|gif);base64,/i
const EXTERNAL_URL = /url\(\s*['"]?\s*(?!#)[^)]*\)/i
const UNSAFE = /<script|<foreignObject|\son[a-z]+\s*=|javascript:|@import|<iframe|<embed|<object/i

export type CleanSvg = {
  markup: string
  root: { width?: string; height?: string; viewBox?: string; preserveAspectRatio?: string }
  hasText: boolean
  hasRaster: boolean
}

export function sanitizeSvg(input: string): CleanSvg {
  const root: CleanSvg['root'] = {}
  let hasText = false, hasRaster = false
  const detach = (node: XastElement, parent: XastParent) => { parent.children = parent.children.filter(c => c !== node) }
  const allowList: CustomPlugin = {
    name: 'crestAllowList',
    fn: () => ({
      element: {
        enter(node, parent) {
          const local = node.name.includes(':') ? node.name.split(':').pop()! : node.name
          if (!ALLOWED.has(local) || node.name.includes(':')) { detach(node, parent); return }
          if (local === 'svg' && parent.type === 'root') {
            for (const k of ['width', 'height', 'viewBox', 'preserveAspectRatio'] as const) if (node.attributes[k]) root[k] = node.attributes[k]
          }
          for (const [k, v] of Object.entries(node.attributes)) {
            const name = k.toLowerCase()
            if (name.startsWith('on') || (name.includes(':') && !/^(xml|xlink|xmlns):/.test(name))) delete node.attributes[k]
            else if (HREF.test(name)) {
              if (local === 'image' ? !DATA_RASTER.test(v) : !LOCAL_REF.test(v)) delete node.attributes[k]
            } else if (/javascript:/i.test(v) || EXTERNAL_URL.test(v)) delete node.attributes[k]
          }
          if (local === 'image') {
            if (!Object.keys(node.attributes).some(k => HREF.test(k))) { detach(node, parent); return }
            hasRaster = true
          }
          if (local === 'text' || local === 'tspan' || local === 'textPath') hasText = true
        },
      },
      text: {
        enter(node, parent) {
          // <style> bodies: no external url(), no @import.
          if (parent.type === 'element' && parent.name === 'style' && (EXTERNAL_URL.test(node.value) || /@import/i.test(node.value))) {
            node.value = node.value.replace(/@import[^;]*;?/gi, '').replace(new RegExp(EXTERNAL_URL.source, 'gi'), 'none')
          }
        },
      },
    }),
  }
  let markup: string
  try {
    markup = optimize(input, {
      // Lossless plugins only: preset-default rounds numbers, which wrecks tiny-scale transforms (Inkscape exports).
      plugins: ['removeDoctype', 'removeXMLProcInst', 'removeComments', 'removeMetadata', 'removeEditorsNSData', 'removeScripts', allowList, 'removeXlink'],
    }).data
  } catch (e) {
    throw new ClubMarkError('E_SVG_UNSAFE', e instanceof Error ? e.message.split('\n')[0] : undefined)
  }
  if (!/^<svg[\s>]/.test(markup) || UNSAFE.test(markup)) throw new ClubMarkError('E_SVG_UNSAFE')
  return { markup, root, hasText, hasRaster }
}

/** Root attributes that position the document; everything else (style, fill-rule, …) is inherited paint. */
const ROOT_GEOMETRY = /^(xmlns(:[\w-]+)?|width|height|viewBox|x|y|version|id|preserveAspectRatio|baseProfile|enable-background|xml:space)$/

/**
 * Split a cleaned SVG into its namespace declarations, the paint its root sets
 * for every child (e.g. `style="fill-rule:evenodd"`), and its children.
 */
export function svgParts(markup: string): { namespaces: string; paint: string; body: string } {
  const open = markup.match(/^<svg\b([^>]*)>/)
  if (!open) throw new ClubMarkError('E_SVG_UNSAFE', 'no root <svg>')
  const attrs = [...open[1]!.matchAll(/\s([\w:-]+)="([^"]*)"/g)]
  const namespaces = attrs.filter(a => /^xmlns:/.test(a[1]!)).map(a => a[0]).join('')
  const paint = attrs.filter(a => !ROOT_GEOMETRY.test(a[1]!)).map(a => a[0]).join('')
  const body = markup.slice(open[0].length).replace(/<\/svg>\s*$/, '')
  return { namespaces, paint, body }
}
