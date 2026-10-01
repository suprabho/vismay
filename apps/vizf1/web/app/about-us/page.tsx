import type { Metadata } from 'next'
import { AboutLanding } from './AboutLanding'

export const metadata: Metadata = {
  title: 'About VizF1 — Formula 1, told in data',
  description:
    'Follow your drivers and teams, see the championship at a glance, swipe the paddock news and rewatch every lap — data journalism for Formula 1.',
}

// Marketing/landing page, in the same shape as Footshorts' /about-us. The root
// route still drops visitors straight into the app (/feed).
export default function AboutUsPage() {
  return <AboutLanding />
}
