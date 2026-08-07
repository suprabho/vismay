import Link from 'next/link'
import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { listAuthorsForAdmin } from '@vismay/content-source/authors'
import { AdminTable } from '@/components/admin'

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
      <AdminTable
        rows={authors}
        rowKey={(author) => author.slug}
        caption="Authors"
        empty="No authors yet."
        columns={[
          {
            key: 'author',
            label: 'Author',
            render: (author) => (
              <Link href={`/vizmaya/authors/${author.slug}`} className="block hover:text-white">
                <div className="truncate font-medium">{author.name}</div>
                <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">{author.slug}</div>
              </Link>
            ),
          },
          {
            key: 'role',
            label: 'Role',
            responsive: 'secondary',
            className: 'text-neutral-400',
            render: (author) => author.role || '—',
          },
          {
            key: 'status',
            label: 'Status',
            className: 'w-32',
            render: (author) => (
              <span className={author.status === 'published' ? 'text-emerald-400' : 'text-amber-400'}>
                {author.status}
              </span>
            ),
          },
          {
            key: 'action',
            label: 'Action',
            sticky: true,
            className: 'w-20 text-right',
            render: (author) => (
              <Link href={`/vizmaya/authors/${author.slug}`} className="text-xs text-neutral-300 hover:text-white">
                Edit
              </Link>
            ),
          },
        ]}
      />
    </div>
  )
}
