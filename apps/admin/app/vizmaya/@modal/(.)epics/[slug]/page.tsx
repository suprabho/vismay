'use client'

import { use } from 'react'
import EpicEditorClient from '@/app/vizmaya/epics/[slug]/EpicEditorClient'
import { RouteEditPanel } from '@/components/admin'

export default function EpicEditModal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return (
    <RouteEditPanel size="wide" label={`Edit epic ${slug}`}>
      <EpicEditorClient slug={slug} sectionHref="/vizmaya" />
    </RouteEditPanel>
  )
}
