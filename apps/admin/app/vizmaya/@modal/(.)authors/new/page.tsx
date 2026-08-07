'use client'

import AuthorEditorClient from '@/app/vizmaya/authors/[slug]/AuthorEditorClient'
import { RouteEditPanel } from '@/components/admin'

export default function NewAuthorModal() {
  return (
    <RouteEditPanel label="New author">
      <AuthorEditorClient slug="" create />
    </RouteEditPanel>
  )
}
