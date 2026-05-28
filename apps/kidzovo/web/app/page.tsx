import Link from 'next/link'
import { getViewableStorySlugs, getStoryContent } from '@vismay/content-source/content'
import { hasStoryConfig } from '@vismay/content-source/storyConfig'

export const revalidate = 60

/**
 * Landing page — lists the Kidzovo stories that have both a `.md` and a
 * `.config.yaml`. Keeps the surface minimal: one card per story with the
 * title and subtitle from frontmatter. Phase-5 work can replace this with
 * a designed homepage once Kidzovo has art direction.
 */
export default async function Home() {
  const slugs = await getViewableStorySlugs()
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      if (!(await hasStoryConfig(slug))) return null
      try {
        const { frontmatter } = await getStoryContent(slug)
        return { slug, frontmatter }
      } catch {
        return null
      }
    })
  )
  const stories = entries.filter((e): e is NonNullable<typeof e> => e !== null)

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-12">
        <h1
          className="text-4xl font-bold"
          style={{ fontFamily: 'Fraunces, ui-serif, Georgia, serif' }}
        >
          Kidzovo
        </h1>
        <p className="mt-2 text-base opacity-70">
          Kids stories, told as scrollytelling panels.
        </p>
      </header>

      {stories.length === 0 ? (
        <p className="opacity-60">No stories yet.</p>
      ) : (
        <ul className="space-y-4">
          {stories.map(({ slug, frontmatter }) => (
            <li key={slug}>
              <Link
                href={`/story/${slug}`}
                className="block rounded-lg border border-current/10 bg-white/40 p-5 transition hover:bg-white/70"
              >
                <h2 className="text-xl font-semibold">{frontmatter.title}</h2>
                {frontmatter.subtitle && (
                  <p className="mt-1 text-sm opacity-70">{frontmatter.subtitle}</p>
                )}
                {frontmatter.byline && (
                  <p className="mt-2 text-xs uppercase tracking-wider opacity-50">
                    {frontmatter.byline}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
