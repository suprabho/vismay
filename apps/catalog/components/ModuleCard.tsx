import Link from 'next/link'
import type { VizSlot } from '@vismay/viz-engine'
import MetaPills from './MetaPills'
import VizModulePreview from './VizModulePreview'

interface Props {
  type: string
  label: string
  slots: readonly VizSlot[]
  mountingMode?: string
  sample: unknown
  previewNotice?: string
}

export default function ModuleCard({
  type,
  label,
  slots,
  mountingMode,
  sample,
  previewNotice,
}: Props) {
  return (
    <Link
      href={`/${encodeURIComponent(type)}`}
      className="group block rounded-lg border border-[color:var(--color-line)] overflow-hidden hover:border-[color:var(--color-accent)] transition-colors"
    >
      <div className="relative aspect-video w-full bg-[color:var(--color-surface)] overflow-hidden">
        <VizModulePreview type={type} sample={sample} previewNotice={previewNotice} />
      </div>
      <div className="p-3 border-t border-[color:var(--color-line)] flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium truncate">{label}</h3>
          <MetaPills slots={slots} mountingMode={mountingMode} />
        </div>
        <code className="text-[11px] font-mono text-[color:var(--color-muted)] truncate">
          {type}
        </code>
      </div>
    </Link>
  )
}
