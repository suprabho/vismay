/** The VizNBA ball mark: an accent disc with seams cut in background ink. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="16" cy="16" r="15" className="fill-accent" />
      <path
        d="M16 1v30M1 16h30M6 5.5c4 3 6 6.5 6 10.5s-2 7.5-6 10.5M26 5.5c-4 3-6 6.5-6 10.5s2 7.5 6 10.5"
        fill="none"
        stroke="#0b0d12"
        strokeWidth={1.6}
      />
    </svg>
  )
}
