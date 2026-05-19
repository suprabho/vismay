/**
 * Internal landing page for the per-story report + slides builders.
 *
 * Lists every slug (drafts + published, including unlisted) so the author
 * can jump into any builder. Each row links to /reports/<slug>; an "edited"
 * badge marks slugs that already have a report.yaml override file.
 *
 * Gated by the same admin password as /admin (lib/adminAuth.ts cookie).
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import matter from 'gray-matter'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource, type StoryMeta } from '@vismay/content-source/contentSource'
import type { Frontmatter } from '@vismay/viz-engine'

export const dynamic = 'force-dynamic'

interface Row {
  slug: string
  title: string
  status: StoryMeta['status']
  listed: boolean
  hasOverrides: boolean
}

async function loadRows(): Promise<Row[]> {
  const source = getContentSource()
  const metas = await source.listStories()
  const sorted = [...metas].sort((a, b) => {
    const aOrder = a.displayOrder ?? Infinity
    const bOrder = b.displayOrder ?? Infinity
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.slug.localeCompare(b.slug)
  })
  return Promise.all(
    sorted.map(async (m) => {
      const [raw, reportYaml] = await Promise.all([
        source.readMarkdown(m.slug),
        source.readReportYaml(m.slug),
      ])
      const fm = raw ? (matter(raw).data as Partial<Frontmatter>) : {}
      return {
        slug: m.slug,
        title: fm.title ?? m.slug,
        status: m.status,
        listed: m.listed,
        hasOverrides: Boolean(reportYaml && reportYaml.trim().length > 0),
      }
    })
  )
}

export default async function ReportsLandingPage() {
  if (!(await isAuthed())) redirect('/admin/login?next=/reports')

  const rows = await loadRows()

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0a0d12',
        color: '#e8e8e8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '64px 32px',
      }}
    >
      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        <header style={{ marginBottom: '40px' }}>
          <div
            style={{
              fontFamily: 'ui-monospace, SF Mono, monospace',
              fontSize: '11px',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#7a8090',
              marginBottom: '8px',
            }}
          >
            Internal · Reports
          </div>
          <h1 style={{ fontSize: '32px', fontWeight: 600, margin: 0 }}>
            Story exports
          </h1>
          <p
            style={{
              marginTop: '8px',
              color: '#9aa0b0',
              fontSize: '14px',
              maxWidth: '560px',
              lineHeight: 1.55,
            }}
          >
            Pick a story to configure its report + slides PDF. Each builder
            lets you skip pages, override headings/copy, and trigger a
            download.
          </p>
        </header>

        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            border: '1px solid #1f2430',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {rows.length === 0 && (
            <li
              style={{
                padding: '32px 24px',
                color: '#7a8090',
                fontSize: '14px',
              }}
            >
              No stories found.
            </li>
          )}
          {rows.map((row, i) => (
            <li
              key={row.slug}
              style={{
                borderTop: i === 0 ? 'none' : '1px solid #1f2430',
              }}
            >
              <Link
                href={`/reports/${row.slug}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '18px 24px',
                  color: 'inherit',
                  textDecoration: 'none',
                  transition: 'background 120ms ease',
                }}
                className="reports-row"
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.title}
                  </div>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, SF Mono, monospace',
                      fontSize: '11px',
                      color: '#6b7184',
                      marginTop: '4px',
                    }}
                  >
                    {row.slug}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {row.hasOverrides && (
                    <span
                      style={{
                        fontFamily: 'ui-monospace, SF Mono, monospace',
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'rgba(120, 200, 160, 0.12)',
                        color: '#7fc8a4',
                        border: '1px solid rgba(120, 200, 160, 0.25)',
                      }}
                    >
                      Edited
                    </span>
                  )}
                  {row.status !== 'published' && (
                    <span
                      style={{
                        fontFamily: 'ui-monospace, SF Mono, monospace',
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'rgba(200, 160, 100, 0.12)',
                        color: '#d4a86b',
                        border: '1px solid rgba(200, 160, 100, 0.25)',
                      }}
                    >
                      {row.status}
                    </span>
                  )}
                  {!row.listed && row.status === 'published' && (
                    <span
                      style={{
                        fontFamily: 'ui-monospace, SF Mono, monospace',
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'rgba(140, 145, 160, 0.12)',
                        color: '#8c91a0',
                        border: '1px solid rgba(140, 145, 160, 0.25)',
                      }}
                    >
                      Unlisted
                    </span>
                  )}
                  <span style={{ color: '#6b7184', fontSize: '14px' }}>→</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <style>{`
        .reports-row:hover {
          background: #11151c;
        }
      `}</style>
    </main>
  )
}
