'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { TZ_COOKIE, writeCookie } from '@/lib/prefsShared'

/**
 * Server components render times in the zone stored in a cookie. On a first
 * visit (or after travelling) store the browser's zone and re-render once.
 */
export function TimeZoneSync({ known }: { known: boolean }) {
  const router = useRouter()
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith(`${TZ_COOKIE}=`))
      ?.slice(TZ_COOKIE.length + 1)
    if (known && current && decodeURIComponent(current) === tz) return
    writeCookie(TZ_COOKIE, tz)
    router.refresh()
  }, [known, router])
  return null
}
