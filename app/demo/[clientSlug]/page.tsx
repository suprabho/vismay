import { notFound, redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { isDemoAuthed } from '@/lib/demoAuth'
import {
  getDemoByClientSlug,
  isValidClientSlug,
  listShareAssetsForDemo,
} from '@/lib/demos'
import { parseDemoContent } from '@/lib/storyDemoConfig'
import { createServiceClient } from '@/lib/supabase'
import DemoPage from '@/components/demo/DemoPage'
import { getStoryContent } from '@/lib/content'
import { getFontImportUrl } from '@/lib/getFontImports'
import type { Theme } from '@/types/story'

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
  const adminBypass = await isAuthed()

  // Non-admins always go through the login form when access conditions
  // aren't met. Same redirect for missing/draft/wrong-cookie so there's
  // no slug-enumeration channel — the auth route returns the same 401
  // for unknown slugs and wrong passwords. Admins skip this gate so they
  // can preview without juggling demo passwords during prep.
  if (!adminBypass) {
    if (
      !demo ||
      demo.status !== 'live' ||
      !(await isDemoAuthed(clientSlug, demo.password_hash))
    ) {
      redirect(`/demo/${clientSlug}/login`)
    }
  }

  // Archived/missing demos shouldn't be revivable even for admins.
  if (!demo || demo.status === 'archived') notFound()

  const content = parseDemoContent(demo.content_yaml)

  const supabase = createServiceClient()

  // Pull every cached asset for the underlying story in parallel — the
  // gallery components handle missing rows gracefully.
  const [shareAssets, videoFull, videoPreview, pdfReport, pdfSlides, storyTheme] = await Promise.all([
    listShareAssetsForDemo(demo.id),
    fetchVideo(supabase, demo.story_slug, '9:16', true),
    fetchVideo(supabase, demo.story_slug, '16:9', true),
    fetchPdf(supabase, demo.story_slug, 'report'),
    fetchPdf(supabase, demo.story_slug, 'slides'),
    fetchStoryTheme(demo.story_slug),
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
      theme={storyTheme}
      fontImportUrl={storyTheme ? getFontImportUrl(storyTheme.fonts) : null}
    />
  )
}

/**
 * Read the underlying story's theme so the demo wraps it in the same
 * palette + typography. If the story can't be loaded (e.g. its config
 * is broken), return null and let DemoPage fall back to its defaults.
 */
async function fetchStoryTheme(storySlug: string): Promise<Theme | null> {
  try {
    const story = await getStoryContent(storySlug)
    return story.frontmatter.theme ?? null
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
