import type { Metadata } from 'next'
import { uploadAuth } from '@/lib/uploadAuth'
import { listTripSlugs } from '@/lib/trips'
import UploadLogin from '@/components/upload/UploadLogin'
import CuratePanel from '@/components/curate/CuratePanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Curate trip media',
  robots: { index: false, follow: false, nocache: true },
}

export default async function CuratePage() {
  const authed = await uploadAuth.isAuthed()
  const slugs = listTripSlugs()

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold">Curate trip media</h1>
          <p className="text-sm opacity-60">
            Fix tags, captions and selection — the journey map and scrapbook render what&apos;s
            selected here.
          </p>
        </div>
        <a href="/upload" className="text-sm underline opacity-70">
          bulk upload →
        </a>
      </header>
      {authed ? <CuratePanel slugs={slugs} /> : <UploadLogin />}
    </main>
  )
}
