import type { Metadata } from 'next'
import Link from 'next/link'
import { getDraftEdition } from '@vismay/content-source/dcEditions'
import EditionPage from '../components/EditionPage'
import { SITE_URL, loadEditionContext } from '../editionContext'

// The draft, exactly as the public page will render it, for the admin
// Editions tab's review window. Gated by the signed-URL middleware
// (ADMIN_SESSION_SECRET), never cached, never indexed. Refreshing shows the
// draft's current state, edits included.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Draft preview — AI Data Centers Daily',
  robots: { index: false, follow: false },
}

export default async function DraftPreviewPage() {
  const draft = await getDraftEdition().catch((err) => {
    console.warn(`ai-daily/doom-v-boom/preview: getDraftEdition failed: ${err}`)
    return null
  })
  if (!draft) {
    return (
      <main className="wrap">
        <div className="empty">
          <span className="eyebrow">AI Data Centers · Draft preview</span>
          <h1>No draft edition right now.</h1>
          <p>The composer writes the next draft at 06:15 UTC; the previous one is already published.</p>
          <Link className="cta" href="/ai-daily/doom-v-boom">
            Open the latest edition →
          </Link>
        </div>
      </main>
    )
  }
  const ctx = await loadEditionContext(draft.date)
  return <EditionPage edition={draft} neighbours={ctx.neighbours} previous={ctx.previous} themeOverrides={ctx.themeOverrides} siteUrl={SITE_URL} />
}
