import { getDishes, getStories } from '@/lib/content'
import { UmamiLanding } from '@/components/UmamiLanding'

// The epic row is seeded `draft` (migration 069) and `getEpic` only returns
// published rows, so the landing carries its own descriptor — same pattern as
// vizmaya's global-trade landing. Flip to a live `getEpic` read when the epic
// publishes.
const EPIC_FALLBACK = {
  name: 'Searching for Umami',
  dek: 'A field guide to Asian cuisines, dish by dish — the top-rated foods of India, China, Thailand, Indonesia and Japan, with their regions, categories, key ingredients and ratings.',
}

export const revalidate = 300

export default async function HomePage() {
  const [dishes, stories] = await Promise.all([getDishes(), getStories()])
  return <UmamiLanding epic={EPIC_FALLBACK} dishes={dishes} stories={stories} />
}
