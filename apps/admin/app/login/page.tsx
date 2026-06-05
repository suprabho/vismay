import { redirect } from 'next/navigation'
import AdminLoginForm from '@/components/AdminLoginForm'
import { isAuthed } from '@/lib/adminAuth'

interface Props {
  searchParams: Promise<{ next?: string }>
}

export default async function AdminLoginPage({ searchParams }: Props) {
  if (await isAuthed()) redirect('/')
  const { next } = await searchParams
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <AdminLoginForm next={next ?? '/'} loginEndpoint="/api/login" />
    </div>
  )
}
