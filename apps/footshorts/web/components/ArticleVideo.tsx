'use client';

import { useEffect, useRef } from 'react';
import type Hls from 'hls.js';
import { isHlsUrl } from '@footshorts/shared/media';

type Props = {
  src: string;
  className?: string;
};

/**
 * Feed-card video: a muted, looping, inline player for articles whose
 * `image_url` is really a video (an HLS `.m3u8` manifest or a direct file).
 *
 * Safari plays HLS natively; every other browser needs hls.js on top of Media
 * Source Extensions, so it is loaded lazily and only for manifest URLs. The
 * player runs only while the card is on screen — the feed keeps several cards
 * mounted, and a stack of background HLS streams would burn bandwidth.
 */
export function ArticleVideo({ src, className }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let hls: Hls | null = null;
    let cancelled = false;

    if (!isHlsUrl(src) || video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else {
      void import('hls.js').then(({ default: HlsCtor }) => {
        if (cancelled) return;
        if (!HlsCtor.isSupported()) {
          // No MSE either — let the browser try the manifest directly.
          video.src = src;
          return;
        }
        hls = new HlsCtor({ enableWorker: true, capLevelToPlayerSize: true });
        hls.loadSource(src);
        hls.attachMedia(video);
      });
    }

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) void video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.5 }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      autoPlay
      preload="metadata"
      disablePictureInPicture
      className={className}
    />
  );
}
