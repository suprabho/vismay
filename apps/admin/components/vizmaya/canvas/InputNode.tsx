'use client'

export interface InputNodeData {
  id: string
  label: string
  tag: string
  body: string
  /**
   * 'mono' shows code-like artifacts (markdown, yaml, json) in a monospace
   * face. 'muted' shows prose placeholders for inputs we haven't wired data
   * for yet, so the unwired state is unmistakable.
   */
  variant: 'mono' | 'muted'
}

/**
 * Diagram input node. Same label-above-frame pattern as <CanvasFrame> so the
 * visual language reads as a graph (Reference → Model → Output) — nothing
 * inside the rectangle but the artifact preview itself.
 */
export default function InputNode({ data }: { data: InputNodeData }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 4,
          right: 4,
          top: -22,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 12,
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: '#ddd',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {data.label}
        </span>
        <span
          style={{
            fontSize: 9,
            color: '#666',
            letterSpacing: '0.14em',
            whiteSpace: 'nowrap',
          }}
        >
          {data.tag}
        </span>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#0a0a0a',
          border: '1px solid #262626',
          borderRadius: 8,
          padding: 10,
          overflow: 'hidden',
          fontFamily:
            data.variant === 'mono'
              ? 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
              : 'system-ui, sans-serif',
          fontSize: data.variant === 'mono' ? 10 : 11,
          color: data.variant === 'mono' ? '#9a9a9a' : '#555',
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          fontStyle: data.variant === 'muted' ? 'italic' : 'normal',
        }}
      >
        {data.body}
      </div>
    </>
  )
}
