/**
 * Evergreen pillar content for an epic landing — the crawlable "X, Explained"
 * block that turns an interactive topic hub into a topic-cluster pillar page.
 * Server component: the explainer prose, key takeaways, and the linked list of
 * member stories all render in the SSR HTML, so they're readable by crawlers
 * and AI engines even though the map/grid above them needs JS.
 *
 * Renders nothing when the epic has neither explainer prose nor member stories.
 * Styled neutrally with the site CSS tokens; mount it below the interactive
 * landing in each epic page.
 */

import Link from 'next/link'
import { formatInlineMarkdown } from '@vismay/viz-engine'

export interface PillarStory {
  slug: string
  title: string
}

export default function EpicSeoBlock({
  name,
  explainer,
  takeaways,
  stories,
}: {
  name: string
  explainer?: string | null
  takeaways?: string[]
  stories: PillarStory[]
}) {
  const paragraphs = (explainer ?? '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0 && stories.length === 0) return null

  return (
    <section
      aria-label={`About ${name}`}
      style={{
        background: 'var(--color-background, #0a0e14)',
        color: 'var(--color-foreground, #e0ddd5)',
        fontFamily: 'var(--font-sans)',
        padding: '4rem 1.5rem 5rem',
        borderTop: '1px solid var(--color-line, #1a2830)',
      }}
    >
      <div style={{ maxWidth: '46rem', margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '2rem',
            fontWeight: 700,
            margin: '0 0 1.5rem',
          }}
        >
          {name}, explained
        </h1>

        {paragraphs.map((p, i) => (
          <p key={i} style={{ fontSize: '1.1rem', lineHeight: 1.75, margin: '0 0 1.25rem' }}>
            {formatInlineMarkdown(p)}
          </p>
        ))}

        {takeaways && takeaways.length > 0 && (
          <div
            style={{
              marginTop: '2rem',
              padding: '1.5rem',
              background: 'var(--color-surface, #111820)',
              borderRadius: '0.5rem',
            }}
          >
            <h2
              style={{
                fontSize: '0.8rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--color-muted, #5a6a70)',
                margin: '0 0 1rem',
              }}
            >
              Key takeaways
            </h2>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'grid', gap: '0.6rem' }}>
              {takeaways.map((t, i) => (
                <li key={i} style={{ fontSize: '1rem', lineHeight: 1.6 }}>
                  {formatInlineMarkdown(t)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {stories.length > 0 && (
          <div style={{ marginTop: '2.5rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.3rem',
                fontWeight: 600,
                margin: '0 0 1.25rem',
              }}
            >
              In this series
            </h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
              {stories.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/story/${s.slug}`}
                    style={{ color: 'var(--color-accent, #D85A30)', textDecoration: 'none', fontSize: '1.05rem' }}
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
