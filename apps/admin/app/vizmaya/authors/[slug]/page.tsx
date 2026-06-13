'use client'

import { use } from 'react'
import AuthorEditorClient from './AuthorEditorClient'

export default function AuthorAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  return <AuthorEditorClient slug={slug} create={false} />
}
