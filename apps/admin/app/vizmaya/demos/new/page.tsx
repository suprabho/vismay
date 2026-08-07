import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import NewDemoForm from '@/components/vizmaya/NewDemoForm'

export const dynamic = 'force-dynamic'

export default async function NewDemoPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/demos/new')
  return <NewDemoForm />
}
