import type { Metadata } from 'next'
import HomeWall from '@/components/home/HomeWall'
import { loadHomeData } from '@/lib/home/homeData'
import { homeFontVars } from '@/lib/home/homeFonts'

export const revalidate = 0

export const metadata: Metadata = {
  title: 'vizmaya — Visual Stories',
  description:
    'Data-driven narratives on geopolitics, technology, and the asymmetries that reshape markets.',
  alternates: { canonical: '/' },
}

/**
 * The home page: a wall of the stories, Doom v Boom and the epics, and
 * nothing else (components/home/HomeWall.tsx).
 */
export default async function HomePage() {
  const data = await loadHomeData()
  return <HomeWall data={data} fontVars={homeFontVars} />
}
