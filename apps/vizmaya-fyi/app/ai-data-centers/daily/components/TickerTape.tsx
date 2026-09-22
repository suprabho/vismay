import type { EditionTapeTick } from '@vismay/content-source/dcEditionTypes'
import { DC_LAYERS, STOCK_CATEGORY_TO_LAYER } from '@vismay/content-source/dcEditionTypes'
import { fmtPct } from './editionUtils'

/**
 * The market tape: every active ticker's day close vs prior close, sorted by
 * move, frozen with the edition. The track is doubled so the CSS loop is
 * seamless; reduced-motion disables the animation in the stylesheet.
 */
export default function TickerTape({ tape }: { tape: EditionTapeTick[] }) {
  if (tape.length === 0) {
    return (
      <div className="tape" aria-label="Market tape">
        <div className="tape-empty">No fresh closes in dc_stock_prices for this window.</div>
      </div>
    )
  }
  const ticks = tape.map((t) => (
    <span className="tick" key={t.ticker}>
      <span className="sym">{t.ticker}</span>
      <span className="cat">{DC_LAYERS[STOCK_CATEGORY_TO_LAYER[t.category] ?? 'dc'].short}</span>
      <span className={`chg ${t.changePct >= 0 ? 'up' : 'down'}`}>{fmtPct(t.changePct)}</span>
    </span>
  ))
  return (
    <div className="tape" aria-label="Largest daily moves across tracked tickers">
      <div className="tape-track">
        {ticks}
        <span aria-hidden="true" style={{ display: 'contents' }}>
          {tape.map((t) => (
            <span className="tick" key={`${t.ticker}-dup`}>
              <span className="sym">{t.ticker}</span>
              <span className="cat">{DC_LAYERS[STOCK_CATEGORY_TO_LAYER[t.category] ?? 'dc'].short}</span>
              <span className={`chg ${t.changePct >= 0 ? 'up' : 'down'}`}>{fmtPct(t.changePct)}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
