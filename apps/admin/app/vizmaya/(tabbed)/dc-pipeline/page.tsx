import { redirect } from 'next/navigation'

// The DC-specific dashboard was generalized into the epic-tagged
// /vizmaya/pipeline tab; keep old bookmarks working.
export default function DcPipelineRedirect() {
  redirect('/vizmaya/pipeline?epic=ai-data-centers')
}
