'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import type { StatColor } from '../../lib/storyConfig.types'
import { formatInlineMarkdown, getListItems, isListBlock } from '../../lib/inlineMarkdown'
import type { KeyValueLayerConfig } from './index'

function colorVar(token: StatColor | undefined): string {
  return token ? `var(--color-${token})` : 'var(--color-text)'
}

export default function KeyValueLayerComponent({
  config,
  noteReady,
}: VizRenderProps<KeyValueLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  return (
    <div className="w-full h-full flex flex-col justify-center">
      {config.title && (
        <div
          className="font-mono uppercase tracking-[0.15em] mb-4"
          style={{
            color: 'var(--color-accent)',
            fontSize: '0.75rem',
          }}
        >
          {config.title}
        </div>
      )}
      <dl className="grid gap-3" style={{ gridTemplateColumns: 'auto 1fr' }}>
        {config.items.map((item, i) => (
          <Row key={`${item.key}-${i}`} item={item} />
        ))}
      </dl>
    </div>
  )
}

function Row({ item }: { item: KeyValueLayerConfig['items'][number] }) {
  return (
    <>
      <dt
        className="font-mono uppercase tracking-[0.1em] pr-3"
        style={{
          color: 'var(--color-muted)',
          fontSize: '0.75rem',
          alignSelf: 'baseline',
          paddingTop: '0.15em',
        }}
      >
        {item.key}
      </dt>
      <dd
        className="font-serif"
        style={{
          color: colorVar(item.color),
          fontSize: '1rem',
          margin: 0,
          lineHeight: 1.45,
        }}
      >
        {isListBlock(item.value) ? (
          <ul className="list-disc pl-5 m-0">
            {getListItems(item.value).map((it, j) => (
              <li key={j}>{formatInlineMarkdown(it)}</li>
            ))}
          </ul>
        ) : (
          formatInlineMarkdown(item.value)
        )}
      </dd>
    </>
  )
}
