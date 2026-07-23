import { Redirect, useLocalSearchParams } from 'expo-router'
import { EditorialWebView, VIZMAYA_ORIGIN } from '@/components/EditorialWebView'
import { HIDDEN_EPIC_SLUGS } from '@/lib/hiddenContent'

// Epic reader: a WebView over vizmaya.fyi's bespoke epic landing. Epics are
// served top-level on vizmaya (`/fifa-wc26`, `/energy-profile`, …), so the
// epic slug is the path segment — same shell as the story reader.
export default function EditorialEpicScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  // Deep-link guard: hidden epics (see hiddenContent.ts) never load, even
  // though the web page itself is still live.
  if (slug && HIDDEN_EPIC_SLUGS.has(slug)) return <Redirect href="/feed?tab=editorial" />
  const url = slug ? `${VIZMAYA_ORIGIN}/${encodeURIComponent(slug)}` : VIZMAYA_ORIGIN
  return <EditorialWebView url={url} />
}
