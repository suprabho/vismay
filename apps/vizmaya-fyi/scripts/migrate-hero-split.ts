/**
 * One-shot migration to align cue rows with the hero-split mobile-unit model.
 *
 * Old: hero = 1 mobile unit (unit_index=0). All cues numbered 0..N-1.
 * New: hero = 2 mobile units (title at 0, dek+byline at 1). All later cues
 *      shift up by one. Indices become 0..N.
 *
 * For each slug:
 *   - skip if no hero (config.sections[0] is not kind:hero)
 *   - skip if already migrated (cue count matches the new count)
 *   - else: shift unit_index >= 1 up by 1, then split cue 0 into two cues
 *     proportional to character length (title chars vs dek+byline chars).
 *
 * Audio chunks are NOT touched — the chunk that contains the hero just gets
 * its single hero cue replaced by two cues with adjacent windows.
 */

import fs from 'fs'
import path from 'path'
import { parse as parseYaml } from 'yaml'
import matter from 'gray-matter'
import { createClient } from '@supabase/supabase-js'
import { resolveUnits } from '../lib/resolveUnits'
import { getStoryContent } from '../lib/content'
import { loadStoryConfig } from '../lib/storyConfig'

// Load .env
for (const line of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const eq = t.indexOf('=')
  if (eq === -1) continue
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim()
}

const ROOT = path.resolve(__dirname, '..')
const STORIES_DIR = path.join(ROOT, 'content/stories')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface CueRow {
  unit_index: number
  chunk_index: number
  start_ms: number
  end_ms: number
}

/**
 * Returns the heading + first dek/byline pair for the hero section, or null
 * if the story doesn't lead with a hero. Pulled from the markdown so we can
 * compute the title/dek char-length ratio without rewriting the resolver.
 */
function readHeroBits(slug: string): { headingChars: number; dekChars: number } | null {
  const configPath = path.join(STORIES_DIR, `${slug}.config.yaml`)
  const mdPath = path.join(STORIES_DIR, `${slug}.md`)
  if (!fs.existsSync(configPath) || !fs.existsSync(mdPath)) return null

  const config = parseYaml(fs.readFileSync(configPath, 'utf8'))
  const firstSection = config?.sections?.[0]
  if (firstSection?.kind !== 'hero') return null

  const { content } = matter(fs.readFileSync(mdPath, 'utf8'))

  // Find the heading text. Hero section's `text` anchor names the section
  // heading; the hero section's heading override on the config wins if set.
  // We just need a length, so any reasonable approximation works.
  const heading: string =
    firstSection.heading ??
    content
      .split('\n')
      .find((l) => /^#\s/.test(l))
      ?.replace(/^#\s+/, '')
      .trim() ??
    ''

  // First *italic* paragraph and **bold** byline anywhere in the file —
  // matches the extraction logic in `extractHeroBits` / `unitToNarrationText`.
  const paragraphs = content.split(/\n\n+/).map((p) => p.trim())
  const dek = paragraphs.find((p) => /^\*[^*]/.test(p))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  const byline = paragraphs.find((p) => p.startsWith('**'))?.replace(/^\*+|\*+$/g, '').trim() ?? ''

  return {
    headingChars: heading.length,
    dekChars: dek.length + byline.length,
  }
}

async function migrateSlug(slug: string): Promise<'skipped' | 'migrated' | 'no-hero' | 'error'> {
  const heroBits = readHeroBits(slug)
  if (!heroBits) {
    console.log(`  ${slug}: no hero, skipping`)
    return 'no-hero'
  }
  if (heroBits.headingChars + heroBits.dekChars === 0) {
    console.log(`  ${slug}: hero text empty, can't compute split, skipping`)
    return 'error'
  }

  const { data: cues, error } = await supabase
    .from('story_audio_cues')
    .select('unit_index, chunk_index, start_ms, end_ms')
    .eq('slug', slug)
    .order('unit_index')

  if (error) {
    console.error(`  ${slug}: read error: ${error.message}`)
    return 'error'
  }
  if (!cues || cues.length === 0) {
    console.log(`  ${slug}: no cues yet, skipping`)
    return 'skipped'
  }

  // Idempotency: compare existing cue count to what the post-migration
  // mobileUnits length should be.
  const story = await getStoryContent(slug)
  const config = await loadStoryConfig(slug)
  const { mobileUnits } = resolveUnits(slug, story.sections, config)
  const expected = mobileUnits.length

  if (cues.length === expected) {
    console.log(`  ${slug}: already migrated (${cues.length} cues), skipping`)
    return 'skipped'
  }
  if (cues.length !== expected - 1) {
    console.log(
      `  ${slug}: cue count ${cues.length}, expected ${expected - 1} pre-migration. Skipping.`
    )
    return 'error'
  }

  const cue0 = cues[0]

  // Compute split point inside cue 0's window.
  const ratio =
    heroBits.headingChars / (heroBits.headingChars + heroBits.dekChars)
  const splitMs = Math.round(cue0.start_ms + (cue0.end_ms - cue0.start_ms) * ratio)

  // Build new cue array: split[0]=title, split[1]=dek, then everything else
  // bumped by 1.
  const newRows: CueRow[] = [
    {
      unit_index: 0,
      chunk_index: cue0.chunk_index,
      start_ms: cue0.start_ms,
      end_ms: splitMs,
    },
    {
      unit_index: 1,
      chunk_index: cue0.chunk_index,
      start_ms: splitMs,
      end_ms: cue0.end_ms,
    },
    ...cues.slice(1).map((c) => ({
      unit_index: c.unit_index + 1,
      chunk_index: c.chunk_index,
      start_ms: c.start_ms,
      end_ms: c.end_ms,
    })),
  ]

  // Delete + insert. Doing it in two steps (instead of UPDATE in place)
  // sidesteps the unique-constraint violation that would otherwise hit when
  // shifting unit_index up by 1.
  const { error: delErr } = await supabase
    .from('story_audio_cues')
    .delete()
    .eq('slug', slug)
  if (delErr) {
    console.error(`  ${slug}: delete error: ${delErr.message}`)
    return 'error'
  }

  const { error: insErr } = await supabase
    .from('story_audio_cues')
    .insert(newRows.map((r) => ({ slug, ...r })))
  if (insErr) {
    console.error(`  ${slug}: insert error: ${insErr.message}`)
    return 'error'
  }

  console.log(
    `  ${slug}: ${cues.length} → ${newRows.length} cues; hero split at ${splitMs}ms (ratio ${ratio.toFixed(2)})`
  )
  return 'migrated'
}

async function main() {
  const { data: slugs, error } = await supabase
    .from('story_audio_chunks')
    .select('slug')
  if (error) {
    console.error('Failed to read slugs:', error.message)
    process.exit(1)
  }

  const unique = [...new Set((slugs ?? []).map((r) => r.slug))].sort()
  console.log(`Found ${unique.length} slugs with audio chunks.\n`)

  const counts = { skipped: 0, migrated: 0, 'no-hero': 0, error: 0 }
  for (const slug of unique) {
    const result = await migrateSlug(slug)
    counts[result]++
  }

  console.log('\nSummary:')
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
