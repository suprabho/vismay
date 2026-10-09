import type { Metadata } from 'next'
import HomeStory from '@/components/home/HomeStory'
import { loadHomeData } from '@/lib/home/homeData'
import { homeFontVars } from '@/lib/home/homeFonts'
import { HOME_VIEW_BOOT_SCRIPT, formatStoryDate } from '@/lib/home/homeShape'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'vizmaya — Visual Stories',
  description:
    'Data-driven narratives on geopolitics, technology, and the asymmetries that reshape markets.',
  alternates: { canonical: '/' },
}

/**
 * The home page, told as an HTML story and bound four ways
 * (components/home/HomeStory.tsx): the whole page as a book, a board or a
 * deck, framed from /home-stage/<format>, or as one long scroll, which is
 * what the server renders and the fallback for the others. The inline script
 * runs before paint, so a reader whose binding is a book, board or deck
 * doesn't see the scroll page flash first.
 */
export default async function HomePage() {
  const data = await loadHomeData()
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: HOME_VIEW_BOOT_SCRIPT }} />
      <HomeStory data={data} today={formatStoryDate(new Date().toISOString())} fontVars={homeFontVars} />
    </>
  )
}
