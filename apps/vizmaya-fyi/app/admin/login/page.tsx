import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import LoginForm from '@/components/admin/LoginForm'

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default async function AdminLoginPage({ searchParams }: Props) {
  if (await isAuthed()) redirect('/admin')
  const { next } = await searchParams
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <LoginForm next={next ?? '/admin'} />
    </div>
  )
}
