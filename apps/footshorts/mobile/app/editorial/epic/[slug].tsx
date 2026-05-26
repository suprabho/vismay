import { useLocalSearchParams } from 'expo-router'
import { EditorialWebView, VIZMAYA_ORIGIN } from '@/components/EditorialWebView'

// Epic reader: a WebView over vizmaya.fyi's bespoke epic landing. Epics are
// served top-level on vizmaya (`/fifa-wc26`, `/energy-profile`, …), so the
// epic slug is the path segment — same shell as the story reader.
export default function EditorialEpicScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const url = slug ? `${VIZMAYA_ORIGIN}/${encodeURIComponent(slug)}` : VIZMAYA_ORIGIN
  return <EditorialWebView url={url} />
}
