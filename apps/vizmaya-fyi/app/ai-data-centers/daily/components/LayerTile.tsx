import type { DcLayerKey, EditionChart, EditionLayer } from '@vismay/content-source/dcEditionTypes'
import { DC_LAYERS } from '@vismay/content-source/dcEditionTypes'
import SourceChip from './SourceChip'
import PlannedChart from './PlannedChart'
import CapacityLedger from './layerViz/CapacityLedger'
import ActionMatrix from './layerViz/ActionMatrix'
import HorizonTimeline from './layerViz/HorizonTimeline'
import OrderTimeline from './layerViz/OrderTimeline'

const VIZ_TITLES: Record<DcLayerKey, string> = {
  dc: 'Capacity on the move · MW as disclosed today',
  hyper: "Who moved on what · today's actions by company",
  semi: 'Booked-out horizon · as stated by each supplier',
  equip: 'Orders moving in time · what each toolmaker said',
}

/**
 * Chapter IV — one tile per AI layer: headline + sub, one visualisation,
 * three sourced notes, and the story count. The visualisation is the chart
 * the composer planned for the layer when it planned one (a comparison it
 * chose from the stated figures, rendered at compose time); otherwise the
 * layer's deterministic template drawn from the same facts. The whole tile
 * opens the layer's stories.
 */
export default function LayerTile({ layerKey, layer, chart }: { layerKey: DcLayerKey; layer: EditionLayer; chart?: EditionChart | null }) {
  const meta = DC_LAYERS[layerKey]
  const viz = layer.viz
  const planned = chart?.svg ? chart : null
  return (
    <div className="layer" role="button" tabIndex={0} data-panel={`layer:${layerKey}`}>
      <span className="layer-head">
        <span className="lh">
          <b>{meta.name}</b>
          <small>{meta.desc}</small>
        </span>
        <span className="lcount">
          {layer.count}
          <small>stories</small>
        </span>
      </span>
      <span className="lhead">
        <span className="lheadline">{layer.headline || `No ${meta.name.toLowerCase()} stories in this window`}</span>
        {layer.sub && <span className="lsub">{layer.sub}</span>}
      </span>
      <span className="lviz-wrap">
        <span className="eyebrow">{planned ? planned.title : VIZ_TITLES[layerKey]}</span>
        {planned ? (
          <PlannedChart chart={planned} sources={false} />
        ) : viz ? (
          viz.kind === 'capacity' ? (
            <CapacityLedger viz={viz} id={layerKey} />
          ) : viz.kind === 'matrix' ? (
            <ActionMatrix viz={viz} />
          ) : viz.kind === 'horizon' ? (
            <HorizonTimeline viz={viz} />
          ) : (
            <OrderTimeline viz={viz} id={layerKey} />
          )
        ) : (
          <span className="lviz-empty">No stated figures, actions or horizons in this layer today.</span>
        )}
      </span>
      {layer.notes.length > 0 && (
        <span className="lnotes">
          {layer.notes.map((n, i) => (
            <span className="lnote" key={i}>
              <i />
              <span>
                {n.text}
                {n.sources.map((s) => (
                  <SourceChip key={s.url} source={s} />
                ))}
              </span>
            </span>
          ))}
        </span>
      )}
      <span className="go">Open {layer.count} stories →</span>
    </div>
  )
}
