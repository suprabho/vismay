import StoriesListClient from '@/components/section/StoriesListClient'

// Vizmaya's Stories tab is scoped to the vizmaya-fyi app, like every other app
// section: the list filters to vizmaya-fyi, uploads are tagged to it, and moving
// a story to another app drops it from this list. Unassigned drafts and other
// apps' stories live on the home dashboard and their own app sections.
export default function AdminHome() {
  return <StoriesListClient appSlug="vizmaya-fyi" basePath="/vizmaya" />
}
