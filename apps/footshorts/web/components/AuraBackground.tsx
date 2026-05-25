'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Lazy-loaded iframe of a story's aura visual (aura.promad.design), used as a
 * card background. Self-contained: absolutely fills its (relative, overflow-
 * hidden) parent, never intercepts clicks, and lays a bottom-up gradient over
 * the iframe so card text stays legible. Mirrors vizmaya-fyi's AuraBackground
 * but without the home-page `.bn-aura` global CSS dependency.
 *
 * The iframe only mounts once the card nears the viewport, so a magazine full
 * of cards doesn't spin up dozens of embeds at once.
 */
export function AuraBackground({ slug }: { slug: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShow(true);
          obs.disconnect();
        }
      },
      { rootMargin: '300px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {show && (
        <iframe
          title=""
          src={`https://aura.promad.design/embed/${slug}?hideText=true&hideIcons=true&input=off&theme=light`}
          loading="lazy"
          tabIndex={-1}
          className="absolute inset-0 h-full w-full border-0 bg-transparent"
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 55%, rgba(0,0,0,0) 100%)',
        }}
      />
    </div>
  );
}
