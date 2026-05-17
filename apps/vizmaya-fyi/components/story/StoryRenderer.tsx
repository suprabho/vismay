import { Block, Frontmatter, Theme } from '@/types/story'
import ThemeProvider from './ThemeProvider'
import Hero from './Hero'
import StatBlock from './StatBlock'
import ActHeader from './ActHeader'
import Divider from './Divider'
import ProseSection from './ProseSection'
import SubsectionHeader from './SubsectionHeader'
import DataTable from './DataTable'
import ExposureGrid from './ExposureGrid'
import ScrollySection from './ScrollySection'
import ScenarioToggle from './ScenarioToggle'
import TakeawayGrid from './TakeawayGrid'
import MethodologySection from './MethodologySection'
import FooterBlock from './FooterBlock'
import GenericBlock from './GenericBlock'

function renderBlock(block: Block, index: number) {
  switch (block.type) {
    case 'hero':
      return <Hero key={index} block={block} />
    case 'stat-block':
      return <StatBlock key={index} block={block} />
    case 'act-header':
      return <ActHeader key={index} block={block} />
    case 'divider':
      return <Divider key={index} />
    case 'prose':
      return <ProseSection key={index} block={block} />
    case 'subsection-header':
      return <SubsectionHeader key={index} block={block} />
    case 'data-table':
      return <DataTable key={index} block={block} />
    case 'exposure-grid':
      return <ExposureGrid key={index} block={block} />
    case 'scrolly-section':
      return <ScrollySection key={index} block={block} />
    case 'scenario-toggle':
      return <ScenarioToggle key={index} block={block} />
    case 'takeaway-grid':
      return <TakeawayGrid key={index} block={block} />
    case 'methodology':
      return <MethodologySection key={index} block={block} />
    case 'footer':
      return <FooterBlock key={index} block={block} />
    case 'unknown':
      return <GenericBlock key={index} block={block} />
    default:
      return null
  }
}

export default function StoryRenderer({
  blocks,
  theme,
  meta,
}: {
  blocks: Block[]
  theme: Theme
  meta: Frontmatter
}) {
  return (
    <ThemeProvider theme={theme}>
      <article>
        {blocks.map((block, index) => renderBlock(block, index))}
      </article>
    </ThemeProvider>
  )
}
