import { redirect } from 'next/navigation'

// The DC-specific timeline was generalized into the epic-tagged
// /vizmaya/recaps tab; keep old bookmarks working.
export default function DcRecapsRedirect() {
  redirect('/vizmaya/recaps?epic=ai-data-centers')
}
