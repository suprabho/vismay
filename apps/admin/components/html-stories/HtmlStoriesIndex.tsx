import Link from 'next/link'
import { ArrowSquareOut } from '@phosphor-icons/react/dist/ssr'
import { HTML_STORY_APP_META, type HtmlStoryApp } from '@vismay/html-stories/apps'
import { HTML_STORY_FORMAT_META } from '@vismay/html-stories/formats'
import { listHtmlStoriesForAdmin, type HtmlStorySummary } from '@vismay/html-stories/htmlStories'
import { loadStoryStylePool } from '@vismay/html-stories/storyStyles'
import type { StylePool } from '@vismay/html-stories/styles'
import { htmlStoriesBasePath, htmlStorySiteUrl } from '@/lib/htmlStoryApps'
import { BriefGenerator } from './BriefGenerator'

/**
 * The HTML stories tab for one hosting app (packages/html-stories, migration
 * 085): finished pages written by any agent and hosted as-is at
 * <site>/s/<slug>. Separate from the viz-engine Stories tab; nothing here
 * touches those. Rendered by /vizmaya/html-stories and /<app>/html-stories.
 */
export async function HtmlStoriesIndex({ app }: { app: HtmlStoryApp }) {
  const siteUrl = htmlStorySiteUrl(app)
  const basePath = htmlStoriesBasePath(app)
  const meta = HTML_STORY_APP_META[app]
  const isFootshorts = app === 'footshorts'

  let stories: HtmlStorySummary[] = []
  let loadError: string | null = null
  const [storiesResult, poolResult] = await Promise.allSettled([listHtmlStoriesForAdmin(app), loadStoryStylePool(app)])
  if (storiesResult.status === 'fulfilled') stories = storiesResult.value
  else loadError = storiesResult.reason instanceof Error ? storiesResult.reason.message : 'load failed'
  // The style randomizer is optional: without a pool the brief keeps the house style.
  const stylePool: StylePool | null = poolResult.status === 'fulfilled' ? poolResult.value : null

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">HTML stories</h1>
          <p className="text-sm text-neutral-400 mt-0.5">
            Finished pages from any agent, hosted as-is at {siteUrl.replace(/^https?:\/\//, '')}/s/&lt;slug&gt;
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BriefGenerator app={app} pool={stylePool} />
          <Link
            href={`${basePath}/new`}
            className="text-sm text-neutral-200 hover:text-white px-3 py-1.5 border border-white/10 rounded-lg hover:bg-white/5"
          >
            + New story
          </Link>
        </div>
      </div>

      <details className="px-4 py-3 border-b border-white/5 text-sm text-neutral-400">
        <summary className="cursor-pointer text-neutral-300">How agents post here</summary>
        <ol className="list-decimal ml-5 mt-2 space-y-1.5">
          <li>
            Give the agent the brief: <em>Copy agent brief</em> above, or point it at{' '}
            <code className="text-neutral-300">{siteUrl}/api/html-stories/brief</code>. Pick the story format first:
            a scrolling page, or a <em>book</em>, <em>board</em> or <em>deck</em> built on the runtime the site hosts at{' '}
            <code>/formats</code> (<code>?format=book</code> on that URL). <em>Randomize style</em>{' '}
            (or <code>?style=random</code> on that URL) swaps the house look for a palette and fonts from an existing{' '}
            {meta.name} story.
            {isFootshorts && (
              <>
                {' '}
                <em>Add matches</em> appends the match context — Opta facts and the full stat set, the timeline,
                insights, commentary, the build-up, both sides&rsquo; form and schedule, the table and the
                competition&rsquo;s next fixtures — so the agent writes from real numbers. On the URL that is{' '}
                <code>?fixtures=&lt;id&gt;,&lt;id&gt;&amp;prompt=…</code> with the publish token as a bearer.
              </>
            )}
          </li>
          <li>
            Agents that can make HTTP calls post directly:
            <pre className="mt-1.5 text-xs bg-neutral-900 border border-white/10 rounded-lg p-3 overflow-x-auto text-neutral-300">{`curl -X POST "${siteUrl}/api/html-stories?slug=my-story" \\
  -H "Authorization: Bearer $HTML_STORIES_TOKEN" \\
  -H "Content-Type: text/html" --data-binary @story.html`}</pre>
            Add <code>&amp;publish=1</code> to go live immediately. Claude Desktop/Code can use the{' '}
            <code>publish_html_story</code> tool from the Vismay MCP server
            {isFootshorts ? (
              <>
                {' '}
                with <code>app: &quot;footshorts&quot;</code>
              </>
            ) : null}
            .
          </li>
          <li>Chat-only agents: paste their HTML into <em>New story</em>.</li>
        </ol>
      </details>

      {loadError && (
        <div className="m-4 text-sm text-red-400 border border-red-500/30 bg-red-500/5 rounded-lg px-3 py-2">
          {loadError}. Has migration 085_html_stories.sql been applied?
        </div>
      )}

      {!loadError && stories.length === 0 && (
        <p className="px-4 py-10 text-sm text-neutral-500">No HTML stories yet.</p>
      )}

      <ul className="divide-y divide-white/5">
        {stories.map((s) => (
          <li key={s.slug} className="flex items-center gap-3 px-4 hover:bg-white/[0.025] transition-colors">
            <Link href={`${basePath}/${s.slug}`} className="min-w-0 flex-1 flex flex-col py-4">
              <div className="font-medium truncate">
                {s.title}
                {s.status !== 'published' && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400/80">{s.status}</span>
                )}
                {s.format !== 'scroll' && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-sky-300/80">
                    {HTML_STORY_FORMAT_META[s.format].label}
                  </span>
                )}
              </div>
              <div className="text-xs text-neutral-500 truncate mt-0.5">
                {s.slug}
                {s.source ? ` · ${s.source}` : ''} · updated {new Date(s.updatedAt).toLocaleString()}
              </div>
            </Link>
            {s.status === 'published' && (
              <a
                href={`${siteUrl}/s/${s.slug}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-neutral-400 hover:text-white p-2"
                aria-label="Open live story"
              >
                <ArrowSquareOut size={16} />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
