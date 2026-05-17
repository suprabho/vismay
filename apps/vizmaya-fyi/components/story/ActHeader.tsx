import { ActHeaderBlock } from '@/types/story'

export default function ActHeader({ block }: { block: ActHeaderBlock }) {
  return (
    <div className="text-center px-8 pt-20 pb-8">
      <div
        className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.2em] mb-3"
        style={{ color: 'var(--color-accent)' }}
      >
        {block.actNumber}
      </div>
      <h2 className="font-[family-name:var(--font-serif)] text-[clamp(1.6rem,4vw,2.4rem)] font-bold text-white max-w-[600px] mx-auto leading-[1.25]">
        {block.title}
      </h2>
    </div>
  )
}
