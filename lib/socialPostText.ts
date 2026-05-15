import { getStoryContent } from './content'
import { loadStoryConfig, loadShareConfig } from './storyConfig'
import { resolveUnits } from './resolveUnits'
import { buildShareCardList } from './shareCardList'
import type { AssetRef, Channel } from './socialPostPlans'
import type { ResolvedUnit } from './storyConfig.types'

const SITE_BASE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'https://vizmaya.fyi'

function permalink(slug: string): string {
  return `${SITE_BASE}/story/${slug}`
}

function findUnitForCardId(units: ResolvedUnit[], cardId: string): ResolvedUnit | undefined {
  const m = cardId.match(/^(\d+)-(\d+)-(\d+)-/)
  if (!m) return undefined
  const parentIndex = Number(m[1])
  const subIndex = Number(m[2])
  return units.find((u) => u.parentIndex === parentIndex && u.subIndex === subIndex)
}

function variantOf(cardId: string): 'auto' | 'graph' | 'map-title' {
  if (cardId.endsWith('-map-title')) return 'map-title'
  if (cardId.endsWith('-graph')) return 'graph'
  return 'auto'
}

function sliceIndexOf(cardId: string): number {
  const m = cardId.match(/^\d+-\d+-(\d+)-/)
  return m ? Number(m[1]) : 0
}

function paragraphForCard(unit: ResolvedUnit, cardId: string): string {
  const variant = variantOf(cardId)
  if (variant === 'map-title' || variant === 'graph') {
    const heading = unit.heading ?? unit.parentConfig.heading ?? ''
    const first = unit.paragraphs[0] ?? ''
    return [heading, first].filter(Boolean).join(' — ')
  }
  const slice = sliceIndexOf(cardId)
  const text = unit.paragraphs[slice] ?? unit.paragraphs[0] ?? unit.heading ?? ''
  return text.replace(/\*+/g, '').trim()
}

interface BuildContext {
  title: string
  subtitle: string
  units: ResolvedUnit[]
}

async function loadContext(slug: string): Promise<BuildContext> {
  const story = await getStoryContent(slug)
  const config = await loadStoryConfig(slug)
  const { units } = resolveUnits(slug, story.sections, config)
  return {
    title: story.frontmatter.title,
    subtitle: story.frontmatter.subtitle ?? '',
    units,
  }
}

export async function derivePostText(
  channel: Channel,
  ref: AssetRef,
): Promise<string> {
  const ctx = await loadContext(ref.slug)
  const link = permalink(ref.slug)
  let body = ''

  if (ref.kind === 'share_card') {
    const unit = findUnitForCardId(ctx.units, ref.cardId)
    body = unit ? paragraphForCard(unit, ref.cardId) : ctx.title
  } else if (ref.kind === 'share_card_carousel') {
    const lines: string[] = []
    let first = true
    for (const id of ref.cardIds) {
      const unit = findUnitForCardId(ctx.units, id)
      if (!unit) continue
      const text = paragraphForCard(unit, id)
      if (first) {
        lines.push(text)
        first = false
      } else {
        const oneLine = text.split(/\.\s+/)[0] ?? text
        lines.push(`• ${oneLine.trim()}`)
      }
    }
    body = lines.join('\n')
  } else if (ref.kind === 'slides_pdf' || ref.kind === 'autoplay_video') {
    body = [ctx.title, ctx.subtitle].filter(Boolean).join('\n\n')
  }

  // YouTube descriptions: title + body + link is fine on its own line.
  // X / LinkedIn: keep link on its own line so it auto-unfurls cleanly.
  return [body, link].filter(Boolean).join('\n\n').trim()
}

/**
 * Server helper: enumerate the share cards for a slug. Used by the composer's
 * asset picker.
 */
export async function listShareCards(slug: string) {
  const story = await getStoryContent(slug)
  const config = await loadStoryConfig(slug)
  const shareConfig = await loadShareConfig(slug)
  const { units } = resolveUnits(slug, story.sections, config)
  return buildShareCardList(units, shareConfig?.sections ?? null)
}
