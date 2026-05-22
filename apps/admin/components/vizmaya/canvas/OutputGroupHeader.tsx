'use client'

/**
 * Clickable header strip for one output group (Share / Slides / Report /
 * Autoplay). Toggles the group's iframe stack on and off — when collapsed,
 * the iframes don't mount, so the canvas only ever runs one group's
 * renders at a time. The strip itself stays visible whether expanded or
 * not, so all four groups are always discoverable.
 *
 * Visually: same dark card-on-canvas language as <CanvasFrame> /
 * <InputNode>, with a left-edge disclosure caret and the children labels
 * on the right.
 */
export interface OutputGroupHeaderData {
  id: string
  label: string
  /** Per-output blurbs shown in the header when collapsed, e.g.
   *  ["1080 × 1440", "1080 × 1080", "1440 × 1080"]. */
  childTags: string[]
  expanded: boolean
}

interface Props {
  data: OutputGroupHeaderData
  onClick: () => void
}

export default function OutputGroupHeader({ data, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: 'absolute',
        inset: 0,
        background: data.expanded ? '#161616' : '#0e0e0e',
        border: `1px solid ${data.expanded ? '#555' : '#262626'}`,
        borderRadius: 10,
        color: '#ddd',
        fontFamily: 'system-ui, sans-serif',
        textAlign: 'left',
        cursor: 'pointer',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}
    >
      <span
        style={{
          fontSize: 22,
          color: data.expanded ? '#fff' : '#888',
          width: 18,
          textAlign: 'center',
          lineHeight: 1,
        }}
      >
        {data.expanded ? '▾' : '▸'}
      </span>
      <span
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: data.expanded ? '#fff' : '#bbb',
        }}
      >
        {data.label}
      </span>
      <span
        style={{
          fontSize: 13,
          color: '#666',
          letterSpacing: '0.06em',
        }}
      >
        {data.childTags.length} output{data.childTags.length === 1 ? '' : 's'}
        {!data.expanded && ` · ${data.childTags.join(' · ')}`}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: 11,
          color: '#555',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {data.expanded ? 'loaded' : 'click to load'}
      </span>
    </button>
  )
}
