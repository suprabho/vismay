import { SubsectionHeaderBlock } from '@/types/story'

export default function SubsectionHeader({ block }: { block: SubsectionHeaderBlock }) {
  return (
    <div className="max-w-[640px] mx-auto px-8 pt-8 pb-2">
      <h3
        className="font-[family-name:var(--font-sans)] text-[0.8rem] uppercase tracking-[0.12em]"
        style={{ color: 'var(--color-muted)' }}
      >
        {block.title}
      </h3>
    </div>
  )
}
