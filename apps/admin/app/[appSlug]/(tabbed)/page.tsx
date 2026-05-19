import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listAppStories } from '@vismay/content-source/apps'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ appSlug: string }>
}

export default async function AppStoriesListPage({ params }: Props) {
  const { appSlug } = await params
  if (!(await isAuthed())) redirect(`/login?next=/${appSlug}`)
  const stories = await listAppStories(appSlug)

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/5 flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stories</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            {stories.length} total · app <code className="font-mono">{appSlug}</code>
          </p>
        </div>
      </div>
      {stories.length === 0 ? (
        <div className="px-4 py-10 text-sm text-neutral-500 text-center">
          No stories tagged with this app yet.
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {stories.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/vizmaya/${s.slug}`}
                className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-white/[0.025] transition-colors"
              >
                <div className="min-w-0 flex flex-col">
                  <div className="font-medium truncate">{s.title}</div>
                  <div className="text-xs text-neutral-500 mt-0.5 font-mono truncate">
                    {s.slug}
                  </div>
                </div>
                <span className="shrink-0 text-xs uppercase tracking-wider text-neutral-500">
                  {s.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
