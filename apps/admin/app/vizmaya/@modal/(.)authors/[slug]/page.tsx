'use client'

import { use } from 'react'
import AuthorEditorClient from '@/app/vizmaya/authors/[slug]/AuthorEditorClient'
import { RouteEditPanel } from '@/components/admin'

export default function AuthorEditModal({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return (
    <RouteEditPanel label={`Edit author ${slug}`}>
      <AuthorEditorClient slug={slug} create={false} />
    </RouteEditPanel>
  )
}
