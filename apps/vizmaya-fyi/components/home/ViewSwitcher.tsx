'use client'

import { BookOpen, Cards, PushPin, Rows, type Icon } from '@phosphor-icons/react'
import { HOME_VIEWS, HOME_VIEW_META, type HomeView } from '@/lib/home/homeShape'
import { chooseHomeView } from './homeViewStore'

export const VIEW_ICONS: Record<HomeView, Icon> = {
  book: BookOpen,
  board: PushPin,
  deck: Cards,
  scroll: Rows,
}

/**
 * Rebinds the whole page: Book, Board, Deck or Scroll. Icons only on phones
 * (the labels stay for screen readers), icon and label from md up.
 */
export default function ViewSwitcher({ view }: { view: HomeView }) {
  return (
    <div role="group" aria-label="Read this page as" className="flex rounded-full border border-(--line2) bg-(--surface) p-0.5">
      {HOME_VIEWS.map((v) => {
        const I = VIEW_ICONS[v]
        const on = v === view
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            title={HOME_VIEW_META[v].hint}
            onClick={() => chooseHomeView(v)}
            className={`inline-flex h-9 min-w-10 items-center justify-center gap-1.5 rounded-full px-2.5 text-[14px] font-medium transition-colors md:px-3.5 ${
              on ? 'bg-(--text) text-(--bg)' : 'text-(--muted) hover:text-(--text)'
            }`}
          >
            <I size={17} weight={on ? 'fill' : 'regular'} aria-hidden />
            <span className="sr-only md:not-sr-only">{HOME_VIEW_META[v].label}</span>
          </button>
        )
      })}
    </div>
  )
}
