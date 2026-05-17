import { UnknownBlock } from '@/types/story'

export default function GenericBlock({ block }: { block: UnknownBlock }) {
  return (
    <div className="max-w-[640px] mx-auto px-8 py-4">
      <p
        className="font-[family-name:var(--font-serif)] text-base leading-[1.8]"
        style={{ color: 'var(--color-text)' }}
      >
        {block.content}
      </p>
    </div>
  )
}
