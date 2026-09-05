'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import AssetGrid from '@/components/assets/AssetGrid'
import { suggestEntityId } from './stageEditing'

/**
 * "Add entity" modal (W3): pick an image asset, confirm the auto-suggested
 * id, choose subject/object. Portal to <body> like `ImageEditModal` /
 * `MapPickerModal`. Create stays disabled until the id is non-empty, unique
 * and an asset is picked; the seeded keyframe lands on the current beat
 * (the parent's `onCreate` closes over the playhead).
 */
export default function AddEntityDialog({
  slug,
  existingIds,
  onCreate,
  onClose,
}: {
  slug: string
  existingIds: Set<string>
  onCreate: (opts: { id: string; role: 'subject' | 'object'; assetRef: string }) => void
  onClose: () => void
}) {
  const [assetRef, setAssetRef] = useState('')
  const [id, setId] = useState('')
  const [role, setRole] = useState<'subject' | 'object'>('subject')
  const idTouched = useRef(false)

  // Lock body scroll while open — same convention as the other modals.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  const trimmed = id.trim()
  const duplicate = existingIds.has(trimmed)
  const canCreate = assetRef.length > 0 && trimmed.length > 0 && !duplicate

  const modal = (
    <div
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-neutral-950 text-neutral-100"
    >
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center text-xl leading-none text-neutral-400 hover:text-white"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Stage</div>
          <div className="truncate text-sm">Add entity</div>
        </div>
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => canCreate && onCreate({ id: trimmed, role, assetRef })}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 disabled:pointer-events-none disabled:opacity-40"
        >
          Create
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]">
        <div className="space-y-4 overflow-y-auto border-b border-white/10 p-4 md:border-b-0 md:border-r">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wider text-neutral-400">Entity id</span>
            <input
              type="text"
              value={id}
              onChange={(e) => {
                idTouched.current = true
                setId(e.target.value)
              }}
              placeholder="picked from the asset name"
              spellCheck={false}
              autoCapitalize="none"
              className="w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 font-mono text-[12px] focus:border-white/30 focus:outline-none"
            />
            {duplicate && <p className="text-xs text-red-400">an entity with this id already exists</p>}
          </label>

          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider text-neutral-400">Role</span>
            <div className="flex overflow-hidden rounded-md border border-white/10 text-xs">
              {(['subject', 'object'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 px-3 py-1.5 ${role === r ? 'bg-sky-500/20 text-sky-200' : 'text-neutral-400 hover:bg-white/5'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500">
              subjects are interactive and can take z-focus; objects are ambient decor (hidden on
              portrait by default)
            </p>
          </div>

          <p className="text-[11px] text-neutral-500">
            The entity starts centred with one keyframe on the current beat — drag it into place in
            the preview.
          </p>
        </div>

        <div className="overflow-y-auto p-4">
          <AssetGrid
            slug={slug}
            value={assetRef}
            onPick={(ref) => {
              setAssetRef(ref)
              if (!idTouched.current || id.trim().length === 0) {
                const filename = ref.split('/').pop() ?? ''
                setId(suggestEntityId(filename, existingIds))
                idTouched.current = false
              }
            }}
          />
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(modal, document.body)
}
