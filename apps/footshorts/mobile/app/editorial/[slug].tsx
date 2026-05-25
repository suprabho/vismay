import { useLocalSearchParams } from 'expo-router'
import { EditorialWebView, VIZMAYA_ORIGIN } from '@/components/EditorialWebView'

// Editorial story reader: a WebView over vizmaya.fyi's `/story/<slug>` page.
export default function EditorialReader() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const url = slug
    ? `${VIZMAYA_ORIGIN}/story/${encodeURIComponent(slug)}`
    : VIZMAYA_ORIGIN
  return <EditorialWebView url={url} />
}
