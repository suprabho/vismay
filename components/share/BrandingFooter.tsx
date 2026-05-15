'use client'

export const DEFAULT_SHARE_LOGO = '/vizmaya-logo-01.svg'

export default function BrandingHeader({
  title,
  logo,
}: {
  title: string
  logo?: string
}) {
  const logoSrc = logo ?? DEFAULT_SHARE_LOGO
  return (
    <div className="absolute left-0 right-0 flex items-end justify-between" style={{ bottom: 12 }}>
      {/* Title sits to the right of the Mapbox logo (~40px wide at scale 0.45
          + 4px Mapbox margin) so the two read as a single bottom row. */}
      <span
        className="font-[family-name:var(--font-mono)] uppercase tracking-[0.15em]"
        style={{
          color: 'var(--color-muted)',
          paddingLeft: 100,
          fontSize: 8,
          lineHeight: '10px',
          height: 1,
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {title}
      </span>
      <div className="flex items-center gap-1" style={{ height: 10 }}>
        <span
          className="font-[family-name:var(--font-mono)] uppercase tracking-[0.15em] opacity-70"
          style={{ color: 'var(--color-accent)', fontSize: 8, lineHeight: '10px' }}
        >
          vizmaya
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt=""
          className="block"
          style={{ height: 10, width: 'auto' }}
        />
      </div>
    </div>
  )
}
