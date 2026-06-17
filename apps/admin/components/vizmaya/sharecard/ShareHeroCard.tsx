'use client'

// Ported from apps/vizmaya-fyi/components/share/ShareHeroCard.tsx.

import FitScale from './FitScale'
import type { AspectRatio } from './AspectRatioToggle'

interface Props {
  title: string
  /** Paragraph below the title (the "dek"). Optional. */
  dek?: string
  ratio?: AspectRatio
}

export default function ShareHeroCard({ title, dek }: Props) {
  return (
    <div className="h-full p-[24px] pt-[40px] min-h-0">
      <FitScale>
        <div className="flex flex-col">
          <h1
            className="share-display font-serif font-bold leading-[1.2] text-[28px]"
            style={{ color: 'white' }}
          >
            {title}
          </h1>
          {dek && (
            <p
              className="font-serif text-[19px] leading-[1.45] mt-[20px]"
              style={{ color: 'var(--color-muted)' }}
            >
              {dek}
            </p>
          )}
        </div>
      </FitScale>
    </div>
  )
}
