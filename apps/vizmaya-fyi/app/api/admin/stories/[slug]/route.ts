import { proxyToAdmin } from '@/lib/adminApi'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return proxyToAdmin(req, `/api/vizmaya/stories/${encodeURIComponent(slug)}`)
}
