/**
 * Dump the uploaded + extracted sources for a story into vizmaya-data/<slug>/.
 *
 *   pnpm exec tsx scripts/dump-story-sources.ts <story-slug>
 *
 * For each extracted story_sources row it writes:
 *   - sources/<id>.md  — the extracted Markdown text
 *   - sources/<id>.json — source metadata (title, byline, kind, url, filename)
 *   - sources/index.json — manifest of all sources found
 *
 * The original binary files are also downloaded from the story-sources bucket
 * when a storagePath is present.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * (loaded from apps/admin/.env if present, same as extract-compose-source.ts)
 */

import fs from 'fs'
import path from 'path'
import {
  listStorySources,
  downloadSourceFile,
  type StorySource,
} from '@vismay/content-source/storySources'

function loadLocalEnv(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]!.trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[m[1]!]) process.env[m[1]!] = v
  }
}

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9._-]/gi, '_').slice(0, 80)
}

async function main(): Promise<void> {
  loadLocalEnv()

  const slug = process.argv[2]?.trim()
  if (!slug) {
    console.error('usage: dump-story-sources.ts <story-slug>')
    process.exit(2)
  }

  const repoRoot = path.join(__dirname, '..', '..', '..', '..')
  const outDir = path.join(repoRoot, 'vizmaya-data', slug, 'sources')
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`output → ${outDir}`)

  const sources = await listStorySources(slug)
  if (!sources.length) {
    console.log(`no sources found for story "${slug}"`)
    return
  }
  console.log(`found ${sources.length} source(s)`)

  const manifest: object[] = []

  for (const src of sources) {
    const label = `${src.id} (${src.filename ?? src.sourceUrl ?? src.kind})`
    console.log(`→ ${label} [${src.status}]`)

    // Metadata record for the manifest / per-source JSON.
    const meta = {
      id: src.id,
      kind: src.kind,
      status: src.status,
      filename: src.filename,
      sourceUrl: src.sourceUrl,
      mime: src.mime,
      title: src.title,
      byline: src.byline,
      createdAt: src.createdAt,
      error: src.error,
    }
    manifest.push(meta)

    // Per-source metadata sidecar.
    fs.writeFileSync(path.join(outDir, `${src.id}.json`), JSON.stringify(meta, null, 2) + '\n')

    // Extracted text → .md
    if (src.extractedText) {
      const header = [
        src.title ? `# ${src.title}` : null,
        src.byline ? `_${src.byline}_` : null,
        src.sourceUrl ? `Source: ${src.sourceUrl}` : null,
        '',
      ]
        .filter((l) => l !== null)
        .join('\n')
      fs.writeFileSync(path.join(outDir, `${src.id}.md`), header + src.extractedText + '\n')
      console.log(`  ✓ extracted text: ${src.extractedText.length} chars`)
    } else {
      console.log(`  — no extracted text (${src.status})`)
    }

    // Download original file from the bucket when available.
    if (src.storagePath) {
      try {
        const bytes = await downloadSourceFile(src.storagePath)
        const ext = src.filename ? path.extname(src.filename) : ''
        const origName = src.filename ? safeFilename(src.filename) : `${src.id}${ext}`
        fs.writeFileSync(path.join(outDir, origName), Buffer.from(bytes))
        console.log(`  ✓ original file: ${bytes.byteLength} bytes → ${origName}`)
      } catch (e) {
        console.warn(`  ! could not download original: ${e instanceof Error ? e.message : e}`)
      }
    }
  }

  fs.writeFileSync(
    path.join(outDir, 'index.json'),
    JSON.stringify({ storySlug: slug, exportedAt: new Date().toISOString(), sources: manifest }, null, 2) + '\n',
  )
  console.log(`\ndone — ${sources.length} source(s) written to ${outDir}`)
}

main().catch((e) => {
  console.error('fatal:', e instanceof Error ? e.message : e)
  process.exit(1)
})
