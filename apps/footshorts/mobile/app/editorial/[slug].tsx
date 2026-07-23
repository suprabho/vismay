import { Redirect, useLocalSearchParams } from 'expo-router'
import { storyUrl } from '@vismay/story-embed/url'
import { EditorialWebView, VIZMAYA_ORIGIN } from '@/components/EditorialWebView'
import { HIDDEN_STORY_SLUGS } from '@/lib/hiddenContent'

// Editorial story reader: a WebView over vizmaya.fyi's `/story/<slug>` page.
// `storyUrl` builds the shared chrome-less embed URL (`?embed=1`), so vizmaya's
// brand logo is suppressed and only Footshorts's own back chevron shows.
export default function EditorialReader() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  // Deep-link guard: hidden stories (see hiddenContent.ts) never load.
  if (slug && HIDDEN_STORY_SLUGS.has(slug)) return <Redirect href="/feed?tab=editorial" />
  const url = slug ? storyUrl(slug) : VIZMAYA_ORIGIN
  return <EditorialWebView url={url} />
}
