import type { VideoLayerConfig } from './index'

export const sample: VideoLayerConfig = {
  type: 'video',
  src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  loop: true,
  muted: true,
  autoplay: true,
  fit: 'cover',
}
