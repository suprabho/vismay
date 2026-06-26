/**
 * Minimal inline SVG icons for the replay UI — avoids pulling in lucide-react.
 * lucide-compatible: 24×24 viewBox, currentColor stroke, size prop.
 */
type IconProps = { size?: number; className?: string }

function svg(size: number, className: string | undefined, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  )
}

export const PlayIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" stroke="none" />)

export const PauseIcon = ({ size = 16, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none" />
      <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none" />
    </>,
  )

export const SkipBackIcon = ({ size = 16, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <polygon points="19 20 9 12 19 4 19 20" fill="currentColor" stroke="none" />
      <line x1="5" y1="19" x2="5" y2="5" />
    </>,
  )

export const SkipForwardIcon = ({ size = 16, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <polygon points="5 4 15 12 5 20 5 4" fill="currentColor" stroke="none" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </>,
  )

export const TargetIcon = ({ size = 12, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </>,
  )

export const AlertIcon = ({ size = 20, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </>,
  )

export const SpinnerIcon = ({ size = 16, className }: IconProps) =>
  svg(size, className, <path d="M21 12a9 9 0 1 1-6.219-8.56" />)

export const ResetIcon = ({ size = 16, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </>,
  )

export const CameraIcon = ({ size = 16, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </>,
  )

export const GaugeIcon = ({ size = 14, className }: IconProps) =>
  svg(
    size,
    className,
    <>
      <path d="M12 14l4-4" />
      <path d="M3.34 19a10 10 0 1 1 17.32 0" />
    </>,
  )
