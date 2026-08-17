import { FooterBlock as FooterBlockType } from '@vismay/viz-engine'

export default function FooterBlock({
  block,
  brandLabel = 'vizmaya',
}: {
  block: FooterBlockType
  brandLabel?: string
}) {
  // Strip a leading "<brand> ·" from the text so legacy footers that bake the
  // brand into the copy don't render it twice next to the accent-colored label.
  const text = block.text.startsWith(brandLabel)
    ? block.text.slice(brandLabel.length).replace(/^\s*·?\s*/, '')
    : block.text
  return (
    <div className="text-center py-8">
      <span
        className="font-[family-name:var(--font-mono)] text-[0.7rem] tracking-[0.12em]"
        style={{ color: 'var(--color-muted)' }}
      >
        <span style={{ color: 'var(--color-accent)' }}>{brandLabel}</span>
        {' · '}
        {text}
      </span>
    </div>
  )
}
