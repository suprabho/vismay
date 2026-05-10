/**
 * Two iframes pointed at the same /story/<slug> URL: one wide for desktop
 * layout, one inside a phone-frame mockup so the prospect sees both
 * surfaces at a glance.
 *
 * The phone iframe renders at a real mobile viewport (NATIVE_W × NATIVE_H)
 * and is scaled down with `transform: scale()` so the page's mobile media
 * queries see proper dimensions. Squishing the iframe to bezel-size
 * directly (without scale) causes text/maps to look cramped because the
 * story's mobile layout assumes ~390 px of horizontal real estate.
 *
 * Layout: on md+ the phone is pinned bottom-right of the desktop iframe
 * (Apple feature-page style). Below md it stacks beneath, centered.
 */

interface Props {
  storySlug: string
}

// Real-viewport size the iframe content sees. Picked to match an iPhone 14
// so the story's mobile breakpoints behave naturally.
const NATIVE_W = 390
const NATIVE_H = 845

// Visible bezel width when overlaid on the desktop hero (lg+). Sized so
// total bezel height fits inside a 16:9 hero at the lg breakpoint
// (1024×576) with 24px clearance: 1024*9/16=576 → max bezel ≈ 552 tall →
// width ≈ 260.
const BEZEL_W_DESKTOP = 260
// Visible bezel width on the stacked fallback (below lg).
const BEZEL_W_MOBILE = 280

// Bezel padding around the screen.
const BEZEL_PAD = 10

function scaleFor(bezelW: number): number {
  const screenW = bezelW - BEZEL_PAD * 2
  return screenW / NATIVE_W
}

function bezelHeight(bezelW: number): number {
  // Match the screen's native aspect, then add padding back so the bezel
  // wraps the screen evenly on all sides.
  const scale = scaleFor(bezelW)
  return Math.round(NATIVE_H * scale) + BEZEL_PAD * 2
}

const DESKTOP_SCALE = scaleFor(BEZEL_W_DESKTOP)
const DESKTOP_BEZEL_H = bezelHeight(BEZEL_W_DESKTOP)
const MOBILE_SCALE = scaleFor(BEZEL_W_MOBILE)
const MOBILE_BEZEL_H = bezelHeight(BEZEL_W_MOBILE)

export default function StoryPreview({ storySlug }: Props) {
  const storyUrl = `/story/${storySlug}`
  return (
    <div className="relative" style={{ borderColor: 'var(--demo-fg-line)' }}>
      <div
        className="relative w-full overflow-hidden border"
        style={{
          aspectRatio: '16 / 9',
          background: '#000',
          borderColor: 'var(--demo-fg-line)',
        }}
      >
        <iframe
          src={storyUrl}
          title="Story (desktop)"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          className="absolute inset-0 w-full h-full border-0"
        />

        {/* Phone-frame mockup pinned bottom-right (md+ only). Sized to fit
            inside the 16:9 hero block at typical desktop viewports without
            overflowing. */}
        <div
          className="hidden lg:block absolute z-10"
          style={{
            right: 24,
            bottom: 24,
            width: BEZEL_W_DESKTOP,
            height: DESKTOP_BEZEL_H,
            padding: BEZEL_PAD,
            background: '#1a1a1a',
            border: '1px solid rgb(var(--demo-fg-rgb) / 0.25)',
            borderRadius: 28,
            boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)',
          }}
        >
          <PhoneScreen storyUrl={storyUrl} scale={DESKTOP_SCALE} />
        </div>
      </div>

      {/* Stacked phone block for narrow viewports — replaces the floating
          mockup so neither overlaps the desktop iframe at phone sizes. */}
      <div
        className="lg:hidden mt-6 mx-auto"
        style={{ width: BEZEL_W_MOBILE }}
      >
        <div
          className="relative"
          style={{
            width: BEZEL_W_MOBILE,
            height: MOBILE_BEZEL_H,
            padding: BEZEL_PAD,
            background: '#1a1a1a',
            border: '1px solid rgb(var(--demo-fg-rgb) / 0.25)',
            borderRadius: 36,
            boxShadow: '0 20px 40px -10px rgba(0,0,0,0.6)',
          }}
        >
          <PhoneScreen storyUrl={storyUrl} scale={MOBILE_SCALE} />
        </div>
      </div>
    </div>
  )
}

function PhoneScreen({ storyUrl, scale }: { storyUrl: string; scale: number }) {
  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ borderRadius: 20, background: '#000' }}
    >
      {/* Notch — sits on top of the iframe but doesn't cover meaningful
          content because the story page leaves a safe-area inset at the top. */}
      <div
        className="absolute z-10"
        style={{
          top: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 70,
          height: 16,
          background: '#000',
          borderRadius: 10,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
        }}
      />
      <iframe
        src={storyUrl}
        title="Story (mobile)"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        scrolling="no"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: NATIVE_W,
          height: NATIVE_H,
          border: 0,
          background: '#000',
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          // Keep the iframe's interactive — the scroll inside still works
          // because Chromium passes wheel events through transformed
          // elements as long as scrolling="auto". `scrolling="no"` above
          // disables the scrollbar but lets the prospect see the static
          // first paint; if we want full scroll, drop that attribute.
        }}
      />
    </div>
  )
}
