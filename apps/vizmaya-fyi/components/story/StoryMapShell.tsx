'use client'

import type { ComponentProps, ReactNode } from 'react'
import Link from 'next/link'
import { StoryMapShell as BaseStoryMapShell } from '@vismay/story-reader'
import VizmayaLogo from '@/components/VizmayaLogo'

// next/link-backed home link so the in-app reader keeps client-side nav +
// prefetch. The generic shell defaults to a plain anchor (no Next dependency).
function NextHomeLink({
  href,
  children,
  ...rest
}: {
  href: string
  className?: string
  'aria-label'?: string
  children: ReactNode
}) {
  return (
    <Link href={href} {...rest}>
      {children}
    </Link>
  )
}

/**
 * Vizmaya binding of the generic story shell (`@vismay/story-reader`): injects
 * the Vizmaya logo and a next/link home link. Every vizmaya route imports the
 * reader through this adapter, so call sites are unchanged by the extraction.
 */
export default function StoryMapShell(
  props: ComponentProps<typeof BaseStoryMapShell>
) {
  return (
    <BaseStoryMapShell
      {...props}
      LogoComponent={VizmayaLogo}
      LinkComponent={NextHomeLink}
    />
  )
}
