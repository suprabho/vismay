import { permanentRedirect } from 'next/navigation'

/** The standings page moved under For you; keep old links working. */
export default function OldStandingsPage() {
  permanentRedirect('/for-you/standings')
}
