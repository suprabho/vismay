import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listAuthorsForAdmin } from '@vismay/content-source/authors'

export const dynamic = 'force-dynamic'

export default async function AdminAuthorsListPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/authors')
  const authors = await listAuthorsForAdmin('vizmaya-fyi')

  return (
    <div className="flex-1 flex flex-col">
      <div className="px-4 py-5 border-b border-white/5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Authors</h1>
          <p className="text-sm text-neutral-400 mt-0.5">{authors.length} total</p>
        </div>
        <Link
          href="/vizmaya/authors/new"
          className="text-sm text-neutral-200 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
        >
          + New author
        </Link>
      </div>
      <ul className="divide-y divide-white/5">
        {authors.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/vizmaya/authors/${a.slug}`}
              className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-white/[0.025] transition-colors"
            >
              <div className="min-w-0 flex flex-col">
                <div className="font-medium truncate">
                  {a.name}
                  {a.status !== 'published' && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400/80">{a.status}</span>
                  )}
                </div>
                <div className="text-xs text-neutral-500 truncate mt-0.5">
                  {a.slug}
                  {a.role ? ` · ${a.role}` : ''}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
