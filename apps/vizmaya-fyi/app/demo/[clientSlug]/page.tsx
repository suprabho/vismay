import { notFound, redirect } from 'next/navigation'
import { isDemoAuthed } from '@vismay/content-source/demoAuth'
import {
  getDemoByClientSlug,
  isValidClientSlug,
  listShareAssetsForDemo,
} from '@vismay/content-source/demos'
import { parseDemoContent } from '@vismay/content-source/storyDemoConfig'
import { createServiceClient } from '@vismay/content-source/supabase'
import DemoPage from '@/components/demo/DemoPage'
import { getStoryContent } from '@vismay/content-source/content'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import type { Theme } from '@vismay/viz-engine'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ clientSlug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { clientSlug } = await params
  return {
    title: `Demo · ${clientSlug}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  }
}

export default async function DemoRoute({ params }: Props) {
  const { clientSlug } = await params
  if (!isValidClientSlug(clientSlug)) notFound()

  const demo = await getDemoByClientSlug(clientSlug)

  // Everyone — including admins — goes through the demo password gate.
  // Same redirect for missing/archived/wrong-cookie so there's no
  // slug-enumeration channel; the auth route returns the same 401 for
  // unknown slugs and wrong passwords. Drafts are reachable with the
  // right password (status is a label, not an extra gate); only archived
  // demos are off-limits. The previous admin-cookie bypass is gone because
  // admin lives on vismay.xyz and the cookie can't reach vizmaya.fyi (see
  // docs/auth.md); if a one-click admin preview is needed later it'll be
  // a signed-URL link, not a cookie check.
  if (
    !demo ||
    demo.status === 'archived' ||
    !(await isDemoAuthed(clientSlug, demo.password_hash))
  ) {
    redirect(`/demo/${clientSlug}/login`)
  }

  const content = parseDemoContent(demo.content_yaml)

  const supabase = createServiceClient()

  // Pull every cached asset for the underlying story in parallel — the
  // gallery components handle missing rows gracefully.
  const [shareAssets, videoFull, videoPreview, pdfReport, pdfSlides, storyMeta] = await Promise.all([
    listShareAssetsForDemo(demo.id),
    fetchVideo(supabase, demo.story_slug, '9:16', true),
    fetchVideo(supabase, demo.story_slug, '16:9', true),
    fetchPdf(supabase, demo.story_slug, 'report'),
    fetchPdf(supabase, demo.story_slug, 'slides'),
    fetchStoryMeta(demo.story_slug),
  ])

  return (
    <DemoPage
      clientSlug={clientSlug}
      storySlug={demo.story_slug}
      content={content}
      shareCardIds={demo.share_card_ids ?? []}
      shareAssets={shareAssets}
      videoPreview916={videoFull}
      videoPreview169={videoPreview}
      pdfReport={pdfReport}
      pdfSlides={pdfSlides}
      theme={storyMeta?.theme ?? null}
      auraSlug={storyMeta?.aura ?? null}
      fontImportUrl={storyMeta?.theme ? getFontImportUrl(storyMeta.theme.fonts) : null}
    />
  )
}

/**
 * Read the underlying story's theme + aura slug so the demo wraps it in
 * the same palette/typography and drops the same aura visual into the
 * hero. If the story can't be loaded (e.g. its config is broken), return
 * null and let DemoPage fall back to its defaults.
 */
async function fetchStoryMeta(
  storySlug: string
): Promise<{ theme: Theme | null; aura: string | null } | null> {
  try {
    const story = await getStoryContent(storySlug)
    return {
      theme: story.frontmatter.theme ?? null,
      aura: story.frontmatter.aura ?? null,
    }
  } catch {
    return null
  }
}

async function fetchVideo(
  sb: ReturnType<typeof createServiceClient>,
  storySlug: string,
  aspect: '9:16' | '16:9',
  preview: boolean
): Promise<{ public_url: string; duration_ms: number | null } | null> {
  const { data } = await sb
    .from('story_videos')
    .select('public_url, duration_ms, preview')
    .eq('slug', storySlug)
    .eq('aspect', aspect)
    .eq('preview', preview)
    .maybeSingle()
  if (!data || !data.public_url) return null
  return { public_url: data.public_url, duration_ms: data.duration_ms }
}

async function fetchPdf(
  sb: ReturnType<typeof createServiceClient>,
  storySlug: string,
  format: 'report' | 'slides'
): Promise<{ public_url: string; thumbnail_url: string | null } | null> {
  const { data } = await sb
    .from('story_pdfs')
    .select('public_url, thumbnail_url')
    .eq('slug', storySlug)
    .eq('format', format)
    .maybeSingle()
  if (!data || !data.public_url) return null
  return {
    public_url: data.public_url,
    thumbnail_url: (data as { thumbnail_url?: string | null }).thumbnail_url ?? null,
  }
}
