/**
 * Topic-cluster internal links for a story — the crawlable upward edge of the
 * pillar↔cluster graph. Server component: the breadcrumb ("Part of …") and the
 * related-stories rail render as real `<a>` links in the SSR/SSG HTML, so they
 * pass link equity and are readable by crawlers / AI engines even though the
 * interactive story shell above them needs JS.
 *
 * Renders nothing when the story has no published epic — most stories sit in at
 * most one or two clusters.
 */

import Link from 'next/link'

export interface ClusterEpic {
  slug: string
  name: string
}

export interface ClusterStory {
  slug: string
  title: string
}

export default function StoryClusterLinks({
  epics,
  related,
}: {
  epics: ClusterEpic[]
  /** Sibling stories in the same cluster (current story already excluded). */
  related: ClusterStory[]
}) {
  if (epics.length === 0 && related.length === 0) return null

  return (
    <nav
      aria-label="Related coverage"
      style={{
        position: 'relative',
        zIndex: 1,
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        borderTop: '1px solid var(--color-line, rgba(255,255,255,0.12))',
        padding: '3rem 1.5rem 4rem',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ maxWidth: '48rem', margin: '0 auto' }}>
        {epics.length > 0 && (
          <p
            style={{
              fontSize: '0.8rem',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: 'var(--color-muted)',
              marginBottom: '1.25rem',
            }}
          >
            Part of{' '}
            {epics.map((e, i) => (
              <span key={e.slug}>
                {i > 0 && ', '}
                <Link
                  href={`/${e.slug}`}
                  style={{ color: 'var(--color-accent)', textDecoration: 'none' }}
                >
                  {e.name}
                </Link>
              </span>
            ))}
          </p>
        )}

        {related.length > 0 && (
          <>
            <h2
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.35rem',
                fontWeight: 600,
                margin: '0 0 1rem',
              }}
            >
              Related stories
            </h2>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {related.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/story/${s.slug}`}
                    style={{
                      color: 'var(--color-text)',
                      textDecoration: 'none',
                      fontSize: '1.05rem',
                      borderBottom: '1px solid transparent',
                    }}
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </nav>
  )
}
