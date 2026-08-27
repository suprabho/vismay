'use client'

import MoveStoryControl from './MoveStoryControl'

/**
 * Presentational publishing-settings form: App assignment, Publishing Status,
 * "Show on home page" (`listed`), and "Display order on home page"
 * (`displayOrder`). Owns no persistence — each host wires its own save through
 * `onChange` (and `MoveStoryControl` self-saves the app column out-of-band).
 *
 * Shared by the classic editor's Settings tab (deferred/buffered save via the
 * editor's Save button) and the canvas "Story settings" panel (immediate save).
 */
export default function StorySettingsFields({
  slug,
  appSlug,
  status,
  listed,
  displayOrder,
  onChange,
  onAppMoved,
}: {
  slug: string
  appSlug: string | null
  status: string
  listed: boolean
  displayOrder: number | null
  onChange: (
    meta: Partial<{ status: string; listed: boolean; displayOrder: number | null }>
  ) => void
  /** Fired after MoveStoryControl self-saves the app column. Hosts that derive
   *  UI from the app slug can use it to prompt a refresh. */
  onAppMoved?: (appSlug: string | null) => void
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium mb-2">App</label>
        <MoveStoryControl slug={slug} currentAppSlug={appSlug} onMoved={onAppMoved} />
        <p className="text-xs text-neutral-500 mt-1">
          Move this story to another app, or unassign it back to Drafts.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Publishing Status</label>
        <select
          value={status}
          onChange={(e) => onChange({ status: e.target.value })}
          className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="listed"
          checked={listed}
          onChange={(e) => onChange({ listed: e.target.checked })}
          className="w-4 h-4 rounded"
        />
        <label htmlFor="listed" className="text-sm font-medium">
          Show on home page
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Display order on home page</label>
        <input
          type="number"
          value={displayOrder ? String(displayOrder) : ''}
          onChange={(e) => {
            const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
            onChange({ displayOrder: val })
          }}
          placeholder="Leave empty for unordered"
          className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
        />
        <p className="text-xs text-neutral-500 mt-1">
          Lower numbers appear first (0-indexed). Leave empty to not display.
        </p>
      </div>
    </div>
  )
}
