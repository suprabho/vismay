import { notFound, redirect } from 'next/navigation'
import { getDemoByClientSlug, isValidClientSlug } from '@/lib/demos'
import { isDemoAuthed } from '@/lib/demoAuth'
import { getStoryContent } from '@/lib/content'
import DemoLoginForm from '@/components/demo/DemoLoginForm'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ clientSlug: string }>
}

export const metadata = {
  robots: { index: false, follow: false, nocache: true },
}

function hexToRgbTriple(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return '20 18 14'
  const n = parseInt(m[1], 16)
  return `${(n >> 16) & 0xff} ${(n >> 8) & 0xff} ${n & 0xff}`
}

export default async function DemoLoginPage({ params }: Props) {
  const { clientSlug } = await params
  if (!isValidClientSlug(clientSlug)) notFound()

  const demo = await getDemoByClientSlug(clientSlug)
  if (!demo || demo.status === 'archived') notFound()

  if (await isDemoAuthed(clientSlug, demo.password_hash)) {
    redirect(`/demo/${clientSlug}`)
  }

  // Match the demo page's own theme so the gate doesn't whiplash from one
  // palette to another after sign-in.
  let storyTheme = null
  try {
    const story = await getStoryContent(demo.story_slug)
    storyTheme = story.frontmatter.theme ?? null
  } catch {
    // Fall back to defaults.
  }

  const bg = storyTheme?.colors.background ?? '#14120E'
  const fg = storyTheme?.colors.text ?? '#F4ECD8'
  const accent = storyTheme?.colors.accent ?? '#B5563D'
  const fgRgb = hexToRgbTriple(fg)
  const accentRgb = hexToRgbTriple(accent)

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={
        {
          background: bg,
          color: fg,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
          '--demo-bg': bg,
          '--demo-fg': fg,
          '--demo-fg-rgb': fgRgb,
          '--demo-accent': accent,
          '--demo-accent-rgb': accentRgb,
          '--demo-fg-mute': `rgb(${fgRgb} / 0.5)`,
          '--demo-fg-line': `rgb(${fgRgb} / 0.15)`,
        } as React.CSSProperties
      }
    >
      <DemoLoginForm clientSlug={clientSlug} clientName={demo.client_name} />
    </div>
  )
}
