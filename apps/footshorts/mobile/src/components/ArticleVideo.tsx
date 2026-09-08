import { useEffect } from 'react';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = {
  uri: string;
  /** Play while true, pause while false — the swiper flips this as cards
   *  scroll into and out of the viewport. */
  active?: boolean;
};

/**
 * Feed-card video: a muted, looping, inline player for articles whose
 * `image_url` is really a video (an HLS `.m3u8` manifest or a direct file).
 * AVPlayer / ExoPlayer handle HLS natively, so no extra plumbing is needed.
 */
export function ArticleVideo({ uri, active = true }: Props) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%' }}
      contentFit="cover"
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}
