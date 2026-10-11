import Link from 'next/link';
import type { Metadata } from 'next';
import { listPublishedHtmlStories, type PublishedHtmlStory } from '@vismay/html-stories/htmlStories';
import { HTML_STORY_FORMAT_META } from '@vismay/html-stories/formats';
import { editorialRssUrl } from '@vismay/html-stories/seo';
import { listStoryboards } from '@/lib/storyboards';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Football Editorial: match analysis and data stories',
  description:
    'Football data stories from the Footshorts desk: tactics, title races, transfers and the numbers behind the match.',
  // Replaces the root layout's alternates, so the RSS link is repeated here.
  alternates: { canonical: '/editorial', types: { 'application/rss+xml': '/editorial/rss.xml' } },
  openGraph: { type: 'website', siteName: 'Footshorts', url: '/editorial' },
};

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function StoryCard({ story }: { story: PublishedHtmlStory }) {
  const at = story.publishedAt ?? story.updatedAt;
  const kind = story.format === 'scroll' ? null : HTML_STORY_FORMAT_META[story.format].label;
  return (
    <li>
      {/* /s/<slug> is a route handler serving the story's own document, not a Next page. */}
      <a href={`/s/${story.slug}`} className="group block overflow-hidden rounded-lg border border-border bg-surface">
        {story.ogImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- agent-chosen image on any host
          <img src={story.ogImageUrl} alt="" loading="lazy" className="aspect-[1200/630] w-full object-cover" />
        )}
        <div className="space-y-2 p-4">
          <p className="font-mono text-xs uppercase tracking-wider text-muted">
            <time dateTime={at}>{DATE.format(new Date(at))}</time>
            {kind && <> · {kind}</>}
          </p>
          <h2 className="font-display text-lg font-bold leading-snug group-hover:text-brand">{story.title}</h2>
          {story.description && <p className="text-sm leading-relaxed text-muted">{story.description}</p>}
        </div>
      </a>
    </li>
  );
}

/**
 * The public, server-rendered archive of Footshorts editorials: every
 * published HTML story (/s/<slug>) and native storyboard as plain links, so
 * search engines can find them. The in-app Editorial tab (/feed) is the
 * signed-in reading experience; this is the crawlable index it mirrors.
 */
export default async function EditorialArchivePage() {
  const stories = await listPublishedHtmlStories('footshorts').catch((err) => {
    console.error('[editorial] listing failed:', err);
    return [] as PublishedHtmlStory[];
  });
  const storyboards = listStoryboards();
  const rss = editorialRssUrl('footshorts');

  return (
    <main className="min-h-screen bg-bg font-sans text-text">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-icon.svg" alt="" className="h-7 w-7" />
            <span className="font-display text-lg font-bold">Footshorts</span>
          </Link>
          <Link href="/feed" className="text-sm text-muted hover:text-text">
            Open the feed
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-display text-3xl font-bold">Football editorial</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Data stories from the Footshorts desk: the tactics, title races and transfers behind the headlines, told
          in charts.
        </p>

        {stories.length > 0 ? (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((s) => (
              <StoryCard key={s.slug} story={s} />
            ))}
          </ul>
        ) : (
          <p className="mt-10 text-sm text-muted">No stories yet. Check back soon.</p>
        )}

        {storyboards.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-xl font-bold">Storyboards</h2>
            <ul className="mt-4 space-y-3">
              {storyboards.map((b) => (
                <li key={b.slug}>
                  <Link href={`/editorial/native/${b.slug}`} className="group block">
                    <span className="font-semibold group-hover:text-brand">{b.title}</span>
                    <span className="block text-sm text-muted">{b.subtitle}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-xs text-muted">
          <span>© {new Date().getFullYear()} Footshorts</span>
          {rss && (
            <a href={rss} className="hover:text-text">
              RSS
            </a>
          )}
        </div>
      </footer>
    </main>
  );
}
