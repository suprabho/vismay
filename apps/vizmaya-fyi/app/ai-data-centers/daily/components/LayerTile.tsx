import type { DcLayerKey, EditionLayer } from '@vismay/content-source/dcEditionTypes'
import { DC_LAYERS } from '@vismay/content-source/dcEditionTypes'
import SourceChip from './SourceChip'
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
 * Chapter IV — one tile per AI layer: headline + sub, one bespoke
 * visualisation drawn from what the day's stories state, three sourced
 * notes, and the story count. The whole tile opens the layer's stories.
 */
export default function LayerTile({ layerKey, layer }: { layerKey: DcLayerKey; layer: EditionLayer }) {
  const meta = DC_LAYERS[layerKey]
  const viz = layer.viz
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
        <span className="eyebrow">{VIZ_TITLES[layerKey]}</span>
        {viz ? (
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
