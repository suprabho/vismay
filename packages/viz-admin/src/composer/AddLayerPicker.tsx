'use client'

import { useState } from 'react'
import { getVizModule } from '@vismay/viz-engine'
import { btnCls, menuCls, menuItemCls } from './styles'

/** "+ Add layer" button → a dropdown of the allowed module types, labelled by
 *  each module's `label`. Picking one calls `onAdd(type)`. */
export function AddLayerPicker({
  types,
  onAdd,
}: {
  types: string[]
  onAdd: (type: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (types.length === 0) return null

  return (
    <div className="relative">
      <button type="button" className={btnCls} onClick={() => setOpen((o) => !o)}>
        + Add layer
      </button>
      {open && (
        <div className={menuCls}>
          {types.map((t) => (
            <button
              key={t}
              type="button"
              className={menuItemCls}
              onClick={() => {
                onAdd(t)
                setOpen(false)
              }}
            >
              {getVizModule(t)?.label ?? t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
