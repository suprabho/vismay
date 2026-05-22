'use client'

import { use } from 'react'
import EpicEditorClient from '@/app/vizmaya/epics/[slug]/EpicEditorClient'

export default function AppEpicAdminPage({
  params,
}: {
  params: Promise<{ appSlug: string; slug: string }>
}) {
  const { appSlug, slug } = use(params)
  return <EpicEditorClient slug={slug} sectionHref={`/${appSlug}`} />
}
