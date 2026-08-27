import { notFound } from 'next/navigation'
import { getVideoProject } from '@vismay/content-source/videoProjects'
import type { VideoProjectSnapshot } from '@vismay/viz-admin'
import VideoProjectShell from '../video-project/VideoProjectShell'

export interface VideoProjectSurfaceProps {
  id: string
  /** Capture mode exposes the deterministic seek API for the headless render. */
  capture?: boolean
}

/**
 * Surface body for a freeform video project's render route. Loads the project's
 * opaque snapshot from the DB, casts `config` to the typed `VideoProjectSnapshot`
 * (stored as JSON, exactly like vizmaya share cards), and mounts the shell. The
 * route file owns segment config (`dynamic`); this component owns the fetch.
 */
export async function VideoProjectSurface({ id, capture = false }: VideoProjectSurfaceProps) {
  const project = await getVideoProject(id)
  if (!project) notFound()

  const snapshot = project.config as VideoProjectSnapshot

  return <VideoProjectShell snapshot={snapshot} capture={capture} />
}
