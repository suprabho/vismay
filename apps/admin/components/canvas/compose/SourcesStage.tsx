'use client'

import { useRef, useState } from 'react'
import type {
  StorySource,
  SourceListItem as LibrarySource,
} from '@vismay/content-source/storySources'
import { SourceRow } from './SourceRow'
import { SourceLibraryModal, type LibraryAsset, type LibraryGroup } from './SourceLibraryModal'
import { SectionHeading, btnGhostCls, btnPrimaryCls, inputCls } from './ui'

/**
 * Sources stage: the attached source list plus the add-link/text/file form,
 * ending in the "Generate angles" advance. Form inputs are local state — the
 * stage stays mounted across tab switches, so half-typed text survives.
 * In `wide` (editor) layout the list and the add-form sit side by side.
 */
export function SourcesStage({
  sources,
  busy,
  extracted,
  pending,
  wide,
  appSlug,
  onAddUrl,
  onAddText,
  onAddFile,
  onAddFromSource,
  onAddAsset,
  onAddFromProvider,
  onLoadLibrary,
  onSearchDatasets,
  onEnrich,
  onRemoveSource,
  onReextract,
  onGenAngles,
  onCreateRecap,
}: {
  sources: StorySource[]
  busy: string | null
  extracted: number
  pending: number
  wide?: boolean
  /** The draft's app — gates the footshorts-only "Create recap" button. */
  appSlug?: string | null
  onAddUrl: (url: string) => Promise<boolean>
  onAddText: (text: string) => Promise<boolean>
  onAddFile: (file: File) => Promise<boolean>
  onAddFromSource: (id: string) => Promise<boolean>
  onAddAsset: (key: string) => Promise<boolean>
  onAddFromProvider: (providerKey: string, itemId: string) => Promise<boolean>
  onLoadLibrary: () => Promise<{ sources: LibrarySource[]; assets: LibraryAsset[]; groups: LibraryGroup[] }>
  onSearchDatasets: (query: string) => Promise<LibraryGroup[]>
  onEnrich: (focus: string) => Promise<{ ok: boolean; message?: string }>
  onRemoveSource: (id: string) => void
  onReextract: (id: string) => void
  onGenAngles: () => void
  onCreateRecap: () => Promise<boolean>
}) {
  const [url, setUrl] = useState('')
  const [text, setText] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  // "Create recap" opens the SAME library modal in recap-only mode.
  const [recapOpen, setRecapOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const showRecap = appSlug === 'footshorts'

  async function addUrl() {
    if (!url.trim()) return
    if (await onAddUrl(url.trim())) setUrl('')
  }
  async function addText() {
    if (!text.trim()) return
    if (await onAddText(text.trim())) setText('')
  }
  async function addFile(file: File) {
    await onAddFile(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const list =
    sources.length > 0 ? (
      <ul
        className={
          wide
            ? 'grid grid-cols-[repeat(auto-fill,minmax(22rem,1fr))] items-start gap-1.5'
            : 'space-y-1.5'
        }
      >
        {sources.map((s) => (
          <SourceRow
            key={s.id}
            source={s}
            busy={!!busy}
            reextracting={busy === 'reextract'}
            onReextract={() => onReextract(s.id)}
            onRemove={() => onRemoveSource(s.id)}
          />
        ))}
      </ul>
    ) : wide ? (
      <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-neutral-600">
        No sources yet — add a link, paste text, or upload a file.
      </p>
    ) : null

  const pendingNote = pending > 0 && (
    <p className="text-[11px] leading-relaxed text-amber-300/80">
      Extracting {pending} document{pending > 1 ? 's' : ''} in the background — Office files
      and scanned or graphic-heavy PDFs can take a few minutes (text PDFs finish
      instantly). Statuses update automatically.
    </p>
  )

  const addForm = (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addUrl()}
          placeholder="Paste a link…"
          className={`min-w-0 flex-1 ${inputCls}`}
        />
        <button onClick={addUrl} disabled={!!busy} className={`shrink-0 ${btnGhostCls}`}>
          Add
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="…or paste text"
        rows={2}
        className={`w-full resize-y ${inputCls}`}
      />
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => text.trim() && addText()} disabled={!!busy} className={`shrink-0 ${btnGhostCls}`}>
          Add text
        </button>
        <input
          ref={fileRef}
          type="file"
          onChange={(e) => e.target.files?.[0] && addFile(e.target.files[0])}
          className="min-w-0 text-xs text-neutral-400 file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2.5 file:py-1.5 file:text-xs file:text-neutral-200 file:transition-colors hover:file:bg-white/15"
        />
      </div>
      <button onClick={() => setLibraryOpen(true)} disabled={!!busy} className={`w-full ${btnGhostCls}`}>
        + From library
      </button>
      {showRecap && (
        <button
          onClick={() => setRecapOpen(true)}
          disabled={!!busy}
          className={`w-full ${btnGhostCls}`}
          title="Pull a match-day recap from the library and generate recap-focused angles"
        >
          🏆 Create recap
        </button>
      )}
    </div>
  )

  const generateBtn = (
    <button
      onClick={onGenAngles}
      disabled={!!busy || extracted === 0}
      className={`w-full ${btnPrimaryCls} py-2`}
    >
      {busy === 'angles' ? 'Generating angles…' : 'Generate angles →'}
    </button>
  )

  return (
    <section className="space-y-3">
      {libraryOpen && (
        <SourceLibraryModal
          onClose={() => setLibraryOpen(false)}
          loadLibrary={onLoadLibrary}
          onAddFromSource={onAddFromSource}
          onAddAsset={onAddAsset}
          onAddFromProvider={onAddFromProvider}
          onSearchDatasets={onSearchDatasets}
          onEnrich={onEnrich}
        />
      )}
      {recapOpen && (
        <SourceLibraryModal
          recapMode
          onClose={() => setRecapOpen(false)}
          loadLibrary={onLoadLibrary}
          onAddFromSource={onAddFromSource}
          onAddAsset={onAddAsset}
          onAddFromProvider={onAddFromProvider}
          onSearchDatasets={onSearchDatasets}
          onEnrich={onEnrich}
          onCreateRecap={onCreateRecap}
        />
      )}
      <SectionHeading
        title="Sources"
        count={`${extracted} ready${pending > 0 ? ` · ${pending} extracting` : ''}`}
      />
      {wide ? (
        <div className="grid items-start gap-x-6 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="space-y-3">
            {list}
            {pendingNote}
          </div>
          <div className="space-y-3">
            {addForm}
            {generateBtn}
          </div>
        </div>
      ) : (
        <>
          {list}
          {addForm}
          {generateBtn}
          {pendingNote}
        </>
      )}
    </section>
  )
}
