import { useLocalSearchParams } from 'expo-router'
import { storyUrl } from '@vismay/story-embed/url'
import { EditorialWebView, VIZMAYA_ORIGIN } from '@/components/EditorialWebView'

// Editorial story reader: a WebView over vizmaya.fyi's `/story/<slug>` page.
// `storyUrl` builds the shared chrome-less embed URL (`?embed=1`), so vizmaya's
// brand logo is suppressed and only Footshorts's own back chevron shows.
export default function EditorialReader() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const url = slug ? storyUrl(slug) : VIZMAYA_ORIGIN
  return <EditorialWebView url={url} />
}
