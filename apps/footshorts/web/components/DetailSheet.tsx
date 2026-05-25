"use client";

import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

const MIN_VH = 25;
const MAX_VH = 92;
const DEFAULT_VH = 50;

// Mobile-only resizable bottom sheet. Default 50vh, draggable via the grip handle
// between 25vh and 92vh. At md+ the sheet ignores the drag state and renders as
// the existing left-side floating panel. Themed via --vmy-* CSS vars set by the
// host landing.
export default function DetailSheet({ children }: { children: ReactNode }) {
  const [heightVh, setHeightVh] = useState(DEFAULT_VH);
  const startRef = useRef<{ y: number; vh: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    startRef.current = { y: e.clientY, vh: heightVh };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const dy = e.clientY - startRef.current.y;
    const dvh = (dy / window.innerHeight) * 100;
    // Drag up (negative dy) → grow; drag down → shrink.
    const next = Math.max(MIN_VH, Math.min(MAX_VH, startRef.current.vh - dvh));
    setHeightVh(next);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    startRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      style={{
        "--sheet-h": `${heightVh}vh`,
        background: "color-mix(in srgb, var(--vmy-surface) 94%, transparent)",
        border: "1px solid color-mix(in srgb, var(--vmy-bone) 10%, transparent)",
        boxShadow: "0 24px 48px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px color-mix(in srgb, var(--vmy-ember) 5%, transparent)",
      } as CSSProperties}
      className="absolute z-30 flex flex-col backdrop-blur overflow-hidden rounded-2xl
        left-3 right-3 bottom-3 h-(--sheet-h)
        md:left-4 md:right-auto md:top-20 md:bottom-6 md:h-auto md:max-h-none md:w-[420px] md:rounded-xl"
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="separator"
        aria-label="Drag to resize"
        className="md:hidden flex items-center justify-center pt-2 pb-2 touch-none cursor-grab active:cursor-grabbing shrink-0"
      >
        <span
          className="h-1 w-10 rounded-full"
          style={{ background: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}
          aria-hidden="true"
        />
      </div>
      {children}
    </div>
  );
}
