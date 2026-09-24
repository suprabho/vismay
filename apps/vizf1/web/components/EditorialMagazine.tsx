'use client'

import Link from 'next/link'
import { StoryBentoGrid, StoryCard, StoryGridFonts, StoryGridStyles } from '@vismay/ui'
import type { EditorialGrid } from '@/lib/editorialStories'

// VizF1 tweaks on top of the shared bento grid: app-matching radius, a scrim so
// titles stay legible over any cover image, image-led card heights on phones,
// and layouts for short pages (the shared grid assumes full 4/5-card pages).
const editorialCss = `
.vf-editorial .bcard{border-radius:16px}
.vf-editorial .bcard .bn-thumb::after{content:'';position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.78) 0%,rgba(0,0,0,.28) 45%,transparent 70%),linear-gradient(to bottom,rgba(0,0,0,.45) 0%,transparent 30%)}
.vf-editorial .bcard .bn-thumb img{transition:transform .6s cubic-bezier(.22,1,.36,1)}
.vf-editorial .bcard:hover .bn-thumb img{transform:scale(1.04)}
.vf-editorial .bento-slide:has(> .bcard:only-child){grid-template-rows:1fr}
.vf-editorial .bento-slide:has(> .bcard:only-child) .bcard{grid-column:1 / -1}
.vf-editorial .bento-slide:has(> .bcard:nth-child(2):last-child){grid-template-rows:1fr}
.vf-editorial .bento-slide:has(> .bcard:nth-child(3):last-child) .bcard:nth-child(3){grid-column:1 / -1}
.vf-editorial.stacked .bento-slide:not(:has(> .bcard:nth-child(3))){height:clamp(260px,40vh,380px)}
@media(max-width:820px){
  .vf-editorial .bento-slide .bcard.big{min-height:260px}
  .vf-editorial .bento-slide .bcard.sm{min-height:190px}
  .vf-editorial.stacked .bento-slide:not(:has(> .bcard:nth-child(3))){height:auto}
}
`

export function EditorialMagazine({ grid }: { grid: EditorialGrid | null }) {
  if (!grid) {
    return <p className="text-sm text-muted">Couldn’t load stories. Try again shortly.</p>
  }
  if (grid.stories.length === 0) {
    return <p className="text-sm text-muted">No stories yet.</p>
  }

  return (
    <>
      <StoryGridFonts fontUrls={grid.fontUrls} />
      <StoryGridStyles />
      <style dangerouslySetInnerHTML={{ __html: editorialCss }} />
      <StoryBentoGrid
        items={grid.stories.map((data, n) => ({ data, n }))}
        mode="stacked"
        className="vf-editorial"
        renderCard={(item, { big }) => (
          <StoryCard
            data={item.data}
            n={item.n}
            big={big}
            href={`/editorial/${item.data.slug}`}
            linkComponent={Link}
            background="cover"
          />
        )}
      />
    </>
  )
}
