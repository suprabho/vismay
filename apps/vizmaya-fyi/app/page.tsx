import type { Metadata } from 'next'
import HomeStory from '@/components/home/HomeStory'
import { loadHomeData } from '@/lib/home/homeData'
import { formatStoryDate } from '@/lib/home/homeShape'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'vizmaya — Visual Stories',
  description:
    'Data-driven narratives on geopolitics, technology, and the asymmetries that reshape markets.',
  alternates: { canonical: '/' },
}

/**
 * The home page, told as an HTML story (components/home/HomeStory.tsx). Its
 * front page swaps between a book, a board and a deck, framed from
 * /home-stage/<format>, with a plain scroll as the fallback.
 */
export default async function HomePage() {
  const data = await loadHomeData()
  return <HomeStory data={data} today={formatStoryDate(new Date().toISOString())} />
}
