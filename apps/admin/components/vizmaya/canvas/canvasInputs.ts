import { stringify as yamlStringify } from 'yaml'
import type { ResolvedUnit } from '@vismay/viz-engine'
import type { InputNodeData } from './InputNode'

/**
 * Derive the input subgraph for a section frame. Every section has the same
 * five input types — content, config, chart data, share variants, report
 * override — so the diagram shape stays consistent across sections. Inputs
 * we haven't wired real data for yet ship a 'muted' placeholder so the
 * unwired state is obvious without leaving holes in the topology.
 */
export function buildInputsForUnit(unit: ResolvedUnit): InputNodeData[] {
  const section = unit.parentConfig

  const contentBody =
    unit.paragraphs.length > 0
      ? truncateLines(unit.paragraphs.join('\n\n'), 8)
      : '(no markdown anchored)'

  let configBody: string
  try {
    configBody = truncateLines(yamlStringify(section, { lineWidth: 60 }), 10)
  } catch {
    configBody = '(failed to serialise config slice)'
  }

  const chartBody = section.chart
    ? `chart: ${section.chart}\n\n(JSON data not yet wired)`
    : '(no chart in this section)'

  return [
    {
      id: 'content',
      label: 'Content',
      tag: 'MARKDOWN',
      body: contentBody,
      variant: 'mono',
    },
    {
      id: 'config',
      label: 'Config',
      tag: 'YAML',
      body: configBody,
      variant: 'mono',
    },
    {
      id: 'chart',
      label: 'Chart Data',
      tag: section.chart ? 'JSON' : '—',
      body: chartBody,
      variant: section.chart ? 'mono' : 'muted',
    },
    {
      id: 'share',
      label: 'Share Variants',
      tag: 'YAML',
      body: '(share.yaml slice not yet wired)',
      variant: 'muted',
    },
    {
      id: 'report',
      label: 'Report Override',
      tag: 'YAML',
      body: '(report.yaml slice not yet wired)',
      variant: 'muted',
    },
  ]
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) return text
  return lines.slice(0, maxLines).join('\n') + '\n…'
}
