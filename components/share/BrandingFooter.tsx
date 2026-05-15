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
    <div className="absolute left-0 right-0 flex items-center justify-between" style={{ bottom: 4 }}>
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
      <div className="flex items-center gap-1 h-1.25">
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
