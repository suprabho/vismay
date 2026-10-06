import { Redirect, useLocalSearchParams } from 'expo-router'
import { EditorialWebView } from '@/components/EditorialWebView'
import { HIDDEN_STORY_SLUGS } from '@/lib/hiddenContent'
import { htmlStoryUrl } from '@/lib/links'

// HTML story reader: a WebView over footshorts.com/s/<slug>, the agent-authored
// page (packages/html-stories). `?embed=1` drops the site header and footer so
// only the app's back chevron shows — same shell as the editorial reader.
export default function HtmlStoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  if (!slug || HIDDEN_STORY_SLUGS.has(slug)) return <Redirect href="/feed?tab=editorial" />
  return <EditorialWebView url={htmlStoryUrl(slug)} />
}
