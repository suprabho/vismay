import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import AdminAuth from '@/components/AdminAuth'
import { isAuthed } from '@/lib/adminAuth'

interface Props {
  searchParams: Promise<{ next?: string; error?: string }>
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-admin': 'That account isn’t an authorized admin.',
  auth: 'Sign-in failed. Please try again.',
  'missing-code': 'That sign-in link was invalid or expired.',
}

interface AdminBrand {
  name: string
  accent: string
  accentFg?: string
}

/**
 * Per-vertical brand, derived from the admin host. admin.vizmaya.fyi → Vizmaya,
 * admin.footshorts.com → Footshorts, admin.vizf1.com → VizF1; the vismay.xyz
 * family falls back to the default. Accents are placeholders aligned with each
 * vertical's identity — tune to the real brand tokens as needed.
 */
function brandForHost(host: string | null): AdminBrand {
  const h = (host ?? '').toLowerCase()
  if (h.includes('vizmaya')) return { name: 'Vizmaya Admin', accent: '#7c5cff', accentFg: '#ffffff' }
  if (h.includes('footshorts')) return { name: 'Footshorts Admin', accent: '#16a34a', accentFg: '#ffffff' }
  if (h.includes('vizf1')) return { name: 'VizF1 Admin', accent: '#e10600', accentFg: '#ffffff' }
  return { name: 'Vismay Admin', accent: '#fde047', accentFg: '#0a0a0a' }
}

export default async function AdminLoginPage({ searchParams }: Props) {
  if (await isAuthed()) redirect('/')
  const { next, error } = await searchParams
  const brand = brandForHost((await headers()).get('host'))

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {error && (
          <p className="mb-3 text-sm text-red-400">
            {ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.'}
          </p>
        )}
        <AdminAuth
          next={next ?? '/'}
          brandName={brand.name}
          accent={brand.accent}
          accentFg={brand.accentFg}
        />
      </div>
    </div>
  )
}
