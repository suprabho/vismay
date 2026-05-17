'use client'

type Props = {
  name: string
  imageUrl: string | null
  selected: boolean
  onClick?: () => void
  /** Three-letter code (HAM, VER) shown as fallback when imageUrl is null. */
  code?: string | null
}

export function EntityChip({ name, imageUrl, selected, onClick, code }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mr-2 mb-2 flex items-center rounded-full border px-3 py-2 transition-colors ${
        selected
          ? 'border-accent bg-accent/20 text-accent'
          : 'border-border bg-surface text-text hover:border-muted'
      }`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="mr-2 h-5 w-5 object-contain" />
      ) : code ? (
        <span className="mr-2 rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] text-text/70">
          {code}
        </span>
      ) : null}
      <span className={`text-sm ${selected ? 'font-medium' : ''}`}>{name}</span>
    </button>
  )
}
