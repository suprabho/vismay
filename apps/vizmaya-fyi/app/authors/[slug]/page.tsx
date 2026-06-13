export const revalidate = 300

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAuthor, listAuthors } from '@vismay/content-source/authors'
import { getAllStories } from '@vismay/content-source/content'
import JsonLd from '@/components/JsonLd'
import { buildPersonJsonLd, buildBreadcrumbJsonLd } from '@/lib/jsonLd'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  // Best-effort: don't fail the build if the authors registry isn't there yet
  // (pre-migration 057). Pages still render on demand once the table exists.
  const authors = await listAuthors('vizmaya-fyi').catch(() => [])
  return authors.map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { slug } = await params
  const author = await getAuthor(slug)
  if (!author) return {}
  const description = author.bio ?? `${author.name}${author.role ? ` — ${author.role}` : ''}, vizmaya.`
  const url = `/authors/${slug}`
  return {
    title: `${author.name} — vizmaya`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      title: author.name,
      description,
      url,
      siteName: 'vizmaya',
    },
    twitter: { card: 'summary', title: author.name, description },
  }
}

export default async function AuthorPage({ params }: RouteParams) {
  const { slug } = await params
  const author = await getAuthor(slug)
  if (!author) notFound()

  // Stories that credit this author in frontmatter `authors`.
  const all = await getAllStories('vizmaya-fyi')
  const stories = all.filter((s) => (s.authors ?? []).includes(slug))

  const personJsonLd = buildPersonJsonLd({
    slug: author.slug,
    name: author.name,
    profileUrl: author.profileUrl,
    sameAs: author.sameAs,
    role: author.role,
    bio: author.bio,
    avatarUrl: author.avatarUrl,
  })
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: author.name, url: `/authors/${slug}` },
  ])

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--color-background, #0a0e14)',
        color: 'var(--color-foreground, #e0ddd5)',
        fontFamily: 'var(--font-sans)',
        padding: '5rem 1.5rem',
      }}
    >
      <JsonLd data={[personJsonLd, breadcrumbJsonLd]} />
      <div style={{ maxWidth: '46rem', margin: '0 auto' }}>
        <Link
          href="/"
          style={{ color: 'var(--color-muted, #5a6a70)', textDecoration: 'none', fontSize: '0.85rem' }}
        >
          ← vizmaya
        </Link>

        <header style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', margin: '1.5rem 0 2rem' }}>
          {author.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.avatarUrl}
              alt={author.name}
              width={72}
              height={72}
              style={{ borderRadius: '9999px', objectFit: 'cover', flexShrink: 0 }}
            />
          )}
          <div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 700, margin: 0 }}>
              {author.name}
            </h1>
            {author.role && (
              <p style={{ color: 'var(--color-accent, #D85A30)', margin: '0.25rem 0 0', fontSize: '0.95rem' }}>
                {author.role}
              </p>
            )}
          </div>
        </header>

        {author.bio && (
          <p style={{ fontSize: '1.1rem', lineHeight: 1.7, color: 'var(--color-foreground, #e0ddd5)' }}>
            {author.bio}
          </p>
        )}

        {author.sameAs.length > 0 && (
          <ul style={{ listStyle: 'none', display: 'flex', gap: '1rem', padding: 0, margin: '1.5rem 0 0', flexWrap: 'wrap' }}>
            {author.sameAs.map((href) => (
              <li key={href}>
                <a
                  href={href}
                  rel="me noopener noreferrer"
                  target="_blank"
                  style={{ color: 'var(--color-accent, #D85A30)', textDecoration: 'none', fontSize: '0.9rem' }}
                >
                  {prettyHost(href)}
                </a>
              </li>
            ))}
          </ul>
        )}

        {stories.length > 0 && (
          <section style={{ marginTop: '3rem', borderTop: '1px solid var(--color-line, #1a2830)', paddingTop: '2rem' }}>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '1.3rem', fontWeight: 600, margin: '0 0 1.25rem' }}>
              Stories by {author.name}
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '1rem' }}>
              {stories.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/story/${s.slug}`}
                    style={{ color: 'var(--color-foreground, #e0ddd5)', textDecoration: 'none' }}
                  >
                    <span style={{ fontSize: '1.05rem', fontWeight: 500 }}>{s.title}</span>
                    {s.subtitle && (
                      <span style={{ display: 'block', color: 'var(--color-muted, #5a6a70)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
                        {s.subtitle}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}

function prettyHost(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '')
  } catch {
    return href
  }
}
