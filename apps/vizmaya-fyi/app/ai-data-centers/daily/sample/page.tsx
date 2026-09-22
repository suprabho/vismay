import type { Metadata } from 'next'
import EditionPage from '../components/EditionPage'
import { SITE_URL, editionMetadata } from '../editionContext'
import { SAMPLE_EDITION, SAMPLE_NEIGHBOURS, SAMPLE_PREVIOUS } from '../fixture'

// The design mockup as a live render: the sample edition from
// docs/ai-data-centers-daily-snapshot.html through the real components, so
// the page can be reviewed (and the visualisations exercised) before the
// pipeline has published anything. Never indexed.
export const dynamic = 'force-static'

export const metadata: Metadata = {
  ...editionMetadata(SAMPLE_EDITION, { noindex: true }),
  title: 'Sample edition — AI Data Centers Daily',
  alternates: { canonical: '/ai-data-centers/daily' },
}

export default function SampleEditionPage() {
  return (
    <EditionPage edition={SAMPLE_EDITION} neighbours={SAMPLE_NEIGHBOURS} previous={SAMPLE_PREVIOUS} themeOverrides={{}} siteUrl={SITE_URL} sample />
  )
}
