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
