import StoriesManager from '@/components/section/StoriesManager'

// Vizmaya's Stories tab is scoped to the vizmaya-fyi app. The manager splits it
// into Home (a drag-orderable replica of the live bento grid), Drafts, and
// Archive. Uploads are tagged to vizmaya-fyi and moving a story to another app
// drops it from this list.
export default function AdminHome() {
  return <StoriesManager appSlug="vizmaya-fyi" basePath="/vizmaya" />
}
