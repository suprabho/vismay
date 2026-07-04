import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import DcPipelineClient from './DcPipelineClient'

export const dynamic = 'force-dynamic'

export default async function DcPipelinePage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/dc-pipeline')
  return <DcPipelineClient />
}
