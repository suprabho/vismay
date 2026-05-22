'use client'

import { use } from 'react'
import EpicEditorClient from './EpicEditorClient'

export default function EpicAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <EpicEditorClient slug={slug} sectionHref="/vizmaya" />
}
