import type { Metadata } from 'next'
import UploadLogin from '@/components/upload/UploadLogin'
import UploadPanel from '@/components/upload/UploadPanel'
import { listTripSlugs } from '@/lib/trips'
import { uploadAuth } from '@/lib/uploadAuth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Upload trip media',
  robots: { index: false, follow: false, nocache: true },
}

export default async function UploadPage() {
  const authed = await uploadAuth.isAuthed()
  const slugs = listTripSlugs()

  return (
    <main className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold mb-1">Upload trip media</h1>
      <p className="text-sm opacity-60 mb-6">
        Photos and videos land in the story-assets bucket under the trip&apos;s slug,
        ready to reference as <code className="font-mono">assets://&lt;trip&gt;/&lt;file&gt;</code>.
      </p>
      {!authed ? (
        <UploadLogin />
      ) : slugs.length === 0 ? (
        <p className="text-sm">
          No trips found — import one first (<code className="font-mono">pnpm travel:import</code>).
        </p>
      ) : (
        <UploadPanel slugs={slugs} />
      )}
    </main>
  )
}
