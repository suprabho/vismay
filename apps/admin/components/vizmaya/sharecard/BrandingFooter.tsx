'use client'

// Ported from apps/vizmaya-fyi/components/share/BrandingFooter.tsx. The default
// logo svg is served from apps/admin/public/vizmaya-logo-01.svg.

export const DEFAULT_SHARE_LOGO = '/vizmaya-logo-01.svg'

export default function BrandingHeader({
  title,
  logo,
  vertical,
}: {
  title: string
  logo?: string
  /** Story vertical. `footshorts` ships its own brand, so the Vizmaya
   *  logo + wordmark are suppressed on its share cards (per brand guidelines). */
  vertical?: string
}) {
  const logoSrc = logo ?? DEFAULT_SHARE_LOGO
  const showVizmayaBrand = vertical !== 'footshorts'
  return (
    <div className="absolute left-0 right-0 flex items-center justify-start" style={{ bottom: 4 }}>
      {showVizmayaBrand && (
        <div className="flex items-center gap-1 h-1.25">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            alt=""
            className="block"
            style={{ height: 10, width: 'auto' }}
          />
          <span
            className="font-[family-name:var(--font-mono)] uppercase tracking-[0.15em] opacity-70"
            style={{ color: 'var(--color-accent)', fontSize: 8, lineHeight: '10px' }}
          >
            vizmaya
          </span>
        </div>
      )}
      <span
        className="font-[family-name:var(--font-mono)] uppercase tracking-[0.15em]"
        style={{
          color: 'var(--color-muted)',
          fontSize: 8,
          lineHeight: '10px',
          height: 10,
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          maxWidth: 'calc(100% - 160px)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </span>
    </div>
  )
}
