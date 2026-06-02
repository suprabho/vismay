import { getParagraphs } from './content'
import { resolveAnchor } from './contentAnchors'
import type { ContentSection } from './content'
import type { StoryConfig, ResolvedUnit } from '@vismay/viz-engine'

/**
 * Slice paragraphs according to a spec:
 *  - undefined → all
 *  - number   → single paragraph at that index
 *  - [a, b]   → Array.slice(a, b)
 */
function sliceParagraphs(
  all: string[],
  spec: number | [number, number] | undefined
): string[] {
  if (spec === undefined) return all
  if (typeof spec === 'number') return all.slice(spec, spec + 1)
  return all.slice(spec[0], spec[1])
}

/**
 * For `kind: stat` sections, extract the first `*italic*` paragraph as a
 * subheading (matching the hero dek convention). Returns the subheading text
 * (without `*` markers) and the remaining paragraphs.
 */
function extractStatSubheading(
  paragraphs: string[],
  configOverride: string | undefined
): { subheading: string | undefined; paragraphs: string[] } {
  if (configOverride) return { subheading: configOverride, paragraphs }
  const idx = paragraphs.findIndex((p) => /^\*[^*]/.test(p))
  if (idx === -1) return { subheading: undefined, paragraphs }
  const subheading = paragraphs[idx].replace(/^\*+|\*+$/g, '').trim()
  return {
    subheading,
    paragraphs: [...paragraphs.slice(0, idx), ...paragraphs.slice(idx + 1)],
  }
}

/**
 * Flatten sections + subsections from a StoryConfig into renderable units.
 * Each unit is one viewport-tall snap target. Sections with N subsections
 * expand into N units that share the parent's map state and chart but have
 * their own text anchor.
 *
 * Returns both desktop and mobile unit arrays. Mobile units expand when
 * `mobileParagraphs` is present on a section/subsection.
 */
export function resolveUnits(
  slug: string,
  sections: ContentSection[],
  config: StoryConfig
): {
  units: ResolvedUnit[]
  mobileUnits: ResolvedUnit[]
  shareUnits: ResolvedUnit[]
  /**
   * Maps each desktop unit index → array of mobile unit indices that compose
   * it. For desktop sections without `mobileParagraphs`, this is a single
   * element. Used by autoplay to queue multiple TTS audio segments back-to-back
   * when playing a single desktop unit.
   */
  desktopToMobile: number[][]
  hasMobileOverrides: boolean
  hasShareOverrides: boolean
} {
  const units: ResolvedUnit[] = []
  const mobileUnits: ResolvedUnit[] = []
  const shareUnits: ResolvedUnit[] = []
  const desktopToMobile: number[][] = []
  let hasMobileOverrides = false
  let hasShareOverrides = false

  config.sections.forEach((section, parentIndex) => {
    const subs = section.subsections
    if (subs && subs.length > 0) {
      subs.forEach((sub, subIndex) => {
        const md = resolveAnchor(sections, sub.text)
        if (!md) console.warn(`[story:${slug}] anchor not found: "${sub.text}"`)
        const allParagraphs = md ? getParagraphs(md) : []
        const heading = sub.heading ?? md?.heading
        // `bigStat` is the deck-format alias for `stat` — same italic-subheading
        // extraction rule applies so the giant number renders cleanly with the
        // first italic paragraph as its caption.
        const sectionKind = section.kind ?? 'text'
        const isStat = sectionKind === 'stat' || sectionKind === 'bigStat'
        const sliced = sliceParagraphs(allParagraphs, sub.paragraphs)
        const { subheading, paragraphs: statParagraphs } = isStat
          ? extractStatSubheading(sliced, sub.subheading)
          : { subheading: sub.subheading, paragraphs: sliced }

        // Desktop unit (always one per subsection)
        units.push({
          parentIndex,
          subIndex,
          parentConfig: section,
          heading,
          subheading,
          paragraphs: statParagraphs,
        })

        // Mobile units — expand if mobileParagraphs present.
        const mobileStart = mobileUnits.length
        if (sub.mobileParagraphs) {
          hasMobileOverrides = true
          sub.mobileParagraphs.forEach((mobileSpec, sliceIdx) => {
            const raw = sliceParagraphs(allParagraphs, mobileSpec)
            const mobileParagraphs = isStat
              ? extractStatSubheading(raw, sub.subheading).paragraphs
              : raw
            mobileUnits.push({
              parentIndex,
              subIndex,
              parentConfig: section,
              heading: sliceIdx === 0 ? heading : undefined,
              subheading: sliceIdx === 0 ? subheading : undefined,
              paragraphs: mobileParagraphs,
              sliceIndex: sliceIdx,
            })
          })
        } else {
          // Use `statParagraphs` (already stripped of the *italic* subheading
          // paragraph for stat sections) so the mobile unit doesn't render the
          // subheading line twice — once styled, once as raw-asterisk body.
          // Equivalent to the original slice for non-stat sections.
          mobileUnits.push({
            parentIndex,
            subIndex,
            parentConfig: section,
            heading,
            subheading,
            paragraphs: statParagraphs,
            sliceIndex: 0,
          })
        }
        // Record the mobile range that backs this desktop unit
        const mobileRange: number[] = []
        for (let mi = mobileStart; mi < mobileUnits.length; mi++) mobileRange.push(mi)
        desktopToMobile.push(mobileRange)

        // Share units — expand if shareParagraphs present.
        if (sub.shareParagraphs) {
          hasShareOverrides = true
          sub.shareParagraphs.forEach((shareSpec, sliceIdx) => {
            const rawShare = sliceParagraphs(allParagraphs, shareSpec)
            const shareParagraphs = isStat
              ? extractStatSubheading(rawShare, sub.subheading).paragraphs
              : rawShare
            shareUnits.push({
              parentIndex,
              subIndex,
              parentConfig: section,
              heading: sliceIdx === 0 ? heading : undefined,
              subheading: sliceIdx === 0 ? subheading : undefined,
              paragraphs: shareParagraphs,
            })
          })
        } else {
          shareUnits.push({
            parentIndex,
            subIndex,
            parentConfig: section,
            heading,
            subheading,
            paragraphs: statParagraphs,
          })
        }
      })
    } else if (section.text) {
      const md = resolveAnchor(sections, section.text)
      if (!md) console.warn(`[story:${slug}] anchor not found: "${section.text}"`)
      const allParagraphs = md ? getParagraphs(md) : []
      const heading = section.heading ?? md?.heading
      // `bigStat` (deck alias for `stat`) and `cover` (deck alias for `hero`)
      // share the legacy extraction rules so paragraphs slice the same way.
      const sectionKind = section.kind ?? 'text'
      const isStat = sectionKind === 'stat' || sectionKind === 'bigStat'
      const sliced = sliceParagraphs(allParagraphs, section.paragraphs)
      const { subheading, paragraphs: statParagraphs } = isStat
        ? extractStatSubheading(sliced, section.subheading)
        : { subheading: section.subheading, paragraphs: sliced }

      // Desktop unit
      units.push({
        parentIndex,
        subIndex: 0,
        parentConfig: section,
        heading,
        subheading,
        paragraphs: statParagraphs,
      })

      // Mobile units — expand if mobileParagraphs present.
      // Hero is special: it always splits into 2 mobile units (title, then
      // dek+byline) because the mobile DOM emits two snap sections for it.
      const mobileStart = mobileUnits.length
      const isHero = sectionKind === 'hero' || sectionKind === 'cover'
      if (isHero) {
        hasMobileOverrides = true
        // Title-only half. Paragraphs are intentionally empty — the dek
        // lives on the second mobile unit so it gets its own scroll-snap.
        mobileUnits.push({
          parentIndex,
          subIndex: 0,
          parentConfig: section,
          heading,
          subheading,
          paragraphs: [],
          heroPart: 'title',
          sliceIndex: 0,
        })
        // Dek + byline half. Inherits the original paragraphs (which is where
        // the dek `*…*` and byline `**…**` markdown live).
        mobileUnits.push({
          parentIndex,
          subIndex: 0,
          parentConfig: section,
          heading: undefined,
          subheading: undefined,
          paragraphs: sliceParagraphs(allParagraphs, section.paragraphs),
          heroPart: 'dek',
          sliceIndex: 1,
        })
      } else if (section.mobileParagraphs) {
        hasMobileOverrides = true
        section.mobileParagraphs.forEach((mobileSpec, sliceIdx) => {
          const raw = sliceParagraphs(allParagraphs, mobileSpec)
          // For stat sections, strip the *italic* subheading paragraph from each
          // mobile slice so it isn't rendered twice (once as the styled subheading
          // label and again as body text with raw asterisks).
          const mobileParagraphs = isStat
            ? extractStatSubheading(raw, section.subheading).paragraphs
            : raw
          mobileUnits.push({
            parentIndex,
            subIndex: 0,
            parentConfig: section,
            heading: sliceIdx === 0 ? heading : undefined,
            subheading: sliceIdx === 0 ? subheading : undefined,
            paragraphs: mobileParagraphs,
            sliceIndex: sliceIdx,
          })
        })
      } else {
        // Use `statParagraphs` (already stripped of the *italic* subheading
        // paragraph for stat sections) so the mobile unit doesn't render the
        // subheading line twice — once styled, once as raw-asterisk body.
        // Equivalent to the original slice for non-stat sections.
        mobileUnits.push({
          parentIndex,
          subIndex: 0,
          parentConfig: section,
          heading,
          subheading,
          paragraphs: statParagraphs,
          sliceIndex: 0,
        })
      }
      // Record the mobile range that backs this desktop unit
      const mobileRange: number[] = []
      for (let mi = mobileStart; mi < mobileUnits.length; mi++) mobileRange.push(mi)
      desktopToMobile.push(mobileRange)

      // Share units — expand if shareParagraphs present.
      if (section.shareParagraphs) {
        hasShareOverrides = true
        section.shareParagraphs.forEach((shareSpec, sliceIdx) => {
          const rawShare = sliceParagraphs(allParagraphs, shareSpec)
          const shareParagraphs = isStat
            ? extractStatSubheading(rawShare, section.subheading).paragraphs
            : rawShare
          shareUnits.push({
            parentIndex,
            subIndex: 0,
            parentConfig: section,
            heading: sliceIdx === 0 ? heading : undefined,
            subheading: sliceIdx === 0 ? subheading : undefined,
            paragraphs: shareParagraphs,
          })
        })
      } else {
        shareUnits.push({
          parentIndex,
          subIndex: 0,
          parentConfig: section,
          heading,
          subheading,
          paragraphs: statParagraphs,
        })
      }
    }
  })

  return { units, mobileUnits, shareUnits, desktopToMobile, hasMobileOverrides, hasShareOverrides }
}
