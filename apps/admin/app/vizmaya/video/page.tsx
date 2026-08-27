import { redirect } from 'next/navigation'
import { isAuthed } from '@/lib/adminAuth'
import { VideoEditor } from '@/components/vizmaya/video/VideoEditor'

export const dynamic = 'force-dynamic'

/**
 * Vizmaya "Video" mode — the freeform video editor. Place `VizLayer` clips on
 * tracks with spatial transforms (via the shared `LayerComposer`) and timeline
 * timing + enter/exit animations (via the timeline panel), preview live by
 * scrubbing the playhead, and hand the saved project off to the headless render
 * surface for an MP4. A project is an opaque `VideoProjectSnapshot` persisted in
 * one `video_projects` row, mirroring the share-card library.
 */
export default async function VideoPage() {
  if (!(await isAuthed())) redirect('/login?next=/vizmaya/video')

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 text-neutral-100">
      <VideoEditor accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''} />
    </div>
  )
}
