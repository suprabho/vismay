import type { Metadata } from 'next'
import EditionPage from '../components/EditionPage'
import { SITE_URL, editionMetadata } from '../editionContext'
import { SAMPLE_EDITION, SAMPLE_NEIGHBOURS, SAMPLE_PREVIOUS } from '../fixture'

// The design reference for the daily edition: a fixture run through the
// real components, so the page can be reviewed (and every visualisation
// exercised) without waiting for the pipeline to publish, and so a design
// change is reviewed as the thing that ships rather than as a drawing of it.
// Never indexed. Keep fixture.ts rich enough to exercise each chapter.
export const dynamic = 'force-static'

export const metadata: Metadata = {
  ...editionMetadata(SAMPLE_EDITION, { noindex: true }),
  title: 'Sample edition — AI Data Centers Daily',
  alternates: { canonical: '/ai-daily/doom-v-boom' },
}

export default function SampleEditionPage() {
  return (
    <EditionPage edition={SAMPLE_EDITION} neighbours={SAMPLE_NEIGHBOURS} previous={SAMPLE_PREVIOUS} themeOverrides={{}} siteUrl={SITE_URL} sample />
  )
}
