'use client'

import { use } from 'react'
import EpicEditorClient from '@/app/vizmaya/epics/[slug]/EpicEditorClient'
import { RouteEditPanel } from '@/components/admin'

export default function AppEpicEditModal({ params }: { params: Promise<{ appSlug: string; slug: string }> }) {
  const { appSlug, slug } = use(params)
  return (
    <RouteEditPanel size="wide" label={`Edit epic ${slug}`}>
      <EpicEditorClient slug={slug} sectionHref={`/${appSlug}`} />
    </RouteEditPanel>
  )
}
