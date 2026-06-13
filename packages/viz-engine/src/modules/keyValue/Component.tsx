'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import type { StatColor } from '../../lib/storyConfig.types'
import { formatInlineMarkdown, getListItems, isListBlock } from '../../lib/inlineMarkdown'
import type { KeyValueLayerConfig, KeyValueStyle } from './index'

function colorVar(token: StatColor | undefined): string {
  return token ? `var(--color-${token})` : 'var(--color-text)'
}

/** Resolve a `CssLength` config value (number → px, string → as-is). */
function len(v: number | string | undefined): string | undefined {
  if (v == null) return undefined
  return typeof v === 'number' ? `${v}px` : v
}

const JUSTIFY_TO_FLEX: Record<NonNullable<KeyValueStyle['justify']>, string> = {
  top: 'justify-start',
  center: 'justify-center',
  bottom: 'justify-end',
}

/** Type-scale presets — key (dt) and value (dd) sizes scaled together. */
const SIZE_PRESET: Record<NonNullable<KeyValueStyle['size']>, { key: string; value: string }> = {
  sm: { key: '0.65rem', value: '0.875rem' },
  md: { key: '0.75rem', value: '1rem' },
  lg: { key: '0.875rem', value: '1.25rem' },
}

const ROW_GAP_PRESET: Record<NonNullable<KeyValueStyle['gap']>, string> = {
  tight: '0.375rem',
  normal: '0.75rem',
  loose: '1.5rem',
}

/**
 * Build the key column's grid track. An explicit `keyColumnWidth` wins; else a
 * min/max pair becomes a `minmax(...)`; else the column auto-fits its content.
 */
function keyColumnTrack(s: KeyValueStyle): string {
  const fixed = len(s.keyColumnWidth)
  if (fixed) return fixed
  const min = len(s.keyColumnMinWidth)
  const max = len(s.keyColumnMaxWidth)
  if (min || max) return `minmax(${min ?? 'min-content'}, ${max ?? 'max-content'})`
  return 'auto'
}

export default function KeyValueLayerComponent({
  config,
  noteReady,
}: VizRenderProps<KeyValueLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  // `listStyle` is `.default({})` in the schema, so it's always present — but
  // guard anyway for configs parsed outside the schema path.
  const s = config.listStyle ?? {}
  const justifyClass = JUSTIFY_TO_FLEX[s.justify ?? 'center']
  const sizePreset = SIZE_PRESET[s.size ?? 'md']
  const keySize = len(s.keyFontSize) ?? sizePreset.key
  const valueSize = len(s.valueFontSize) ?? sizePreset.value
  const titleSize = len(s.titleFontSize) ?? '0.75rem'
  const rowGap = len(s.rowGap) ?? ROW_GAP_PRESET[s.gap ?? 'normal']
  const columnGap = len(s.columnGap) ?? '1.5rem'
  const titleGap = len(s.titleGap) ?? '1rem'
  const stacked = s.layout === 'stacked'

  return (
    <div
      className={`w-full h-full flex flex-col ${justifyClass}`}
      style={{ width: len(s.width), minWidth: len(s.minWidth), maxWidth: len(s.maxWidth) }}
    >
      {config.title && (
        <div
          className="font-mono uppercase tracking-[0.15em]"
          style={{
            color: 'var(--color-accent)',
            fontSize: titleSize,
            marginBottom: titleGap,
          }}
        >
          {config.title}
        </div>
      )}
      <dl
        className="grid m-0"
        style={
          stacked
            ? { rowGap }
            : { gridTemplateColumns: `${keyColumnTrack(s)} 1fr`, rowGap, columnGap }
        }
      >
        {config.items.map((item, i) => (
          <Row
            key={`${item.key}-${i}`}
            item={item}
            stacked={stacked}
            keySize={keySize}
            valueSize={valueSize}
          />
        ))}
      </dl>
    </div>
  )
}

function Row({
  item,
  stacked,
  keySize,
  valueSize,
}: {
  item: KeyValueLayerConfig['items'][number]
  stacked: boolean
  keySize: string
  valueSize: string
}) {
  const dt = (
    <dt
      className="font-mono uppercase tracking-[0.1em]"
      style={{
        color: 'var(--color-muted)',
        fontSize: keySize,
        alignSelf: 'baseline',
        paddingTop: stacked ? undefined : '0.15em',
      }}
    >
      {item.key}
    </dt>
  )
  const dd = (
    <dd
      className="font-serif"
      style={{
        color: colorVar(item.color),
        fontSize: valueSize,
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
  )

  // Stacked: key directly above its value as one block (the parent <dl> only
  // needs a single column, so wrap the pair). Columns: emit dt/dd as direct
  // grid children so all keys/values align on shared tracks.
  if (stacked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        {dt}
        {dd}
      </div>
    )
  }
  return (
    <>
      {dt}
      {dd}
    </>
  )
}
