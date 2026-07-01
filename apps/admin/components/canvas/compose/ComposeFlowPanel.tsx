'use client'

import type { ComposeState } from '@vismay/content-source/composeState'
import type { StorySource } from '@vismay/content-source/storySources'
import { AnglesStage } from './AnglesStage'
import { ChartsPanel } from './ChartsPanel'
import { OutlineStage } from './OutlineStage'
import { SectionsStage } from './SectionsStage'
import { SourcesStage } from './SourcesStage'
import { StageTabs } from './StageTabs'
import { Notice } from './ui'
import { useComposeFlow, type ComposeStage } from './useComposeFlow'

/**
 * The canvas-native compose flow. Walks the author through
 * sources → angles → outline → content as STAGE TABS, persisting each step to
 * compose_state via the canvas/compose routes. Stages unlock as the draft
 * progresses and stay MOUNTED once unlocked (the tab toggles visibility only),
 * so in-progress form input survives switching. On materialise it reloads so
 * the Rete2 graph (or editor) re-reads the freshly-created sections.
 *
 * Data state + server calls live in `useComposeFlow`; each stage is its own
 * presentational component owning its form state.
 *
 * Two exports:
 *  - `ComposeFlow`        — the pipeline UI with no positioning of its own.
 *                           Embedded in both the canvas drawer (stacked) and
 *                           the editor's "Research & outline" tab (wide).
 *  - `ComposeFlowPanel`   — a controlled right-side drawer wrapper around it,
 *                           used on the canvas. It stays MOUNTED while open is
 *                           toggled (visibility only) so in-session research
 *                           survives close → reopen.
 */

interface ComposeFlowProps {
  slug: string
  /** The draft's app slug — gates the footshorts-only "Create recap" affordance. */
  appSlug?: string | null
  initialState: ComposeState
  initialSources: StorySource[]
  /**
   * Toggled true by the parent when the surface is (re)shown. On a false→true
   * transition `ComposeFlow` re-pulls the sources list so async PDF extraction
   * that settled while the drawer was hidden shows up. Optional — the editor
   * tab leaves it unset (always visible).
   */
  active?: boolean
  /**
   * Signed canvas-frame iframe URLs keyed by `canvasFrameId(sectionId)` — the
   * SAME map the canvas signs. When present (canvas context) materialised
   * sections show their real render; absent (editor tab) they fall back to the
   * planned-layout schematic.
   */
  frameSrcById?: Record<string, string>
  /**
   * `stack` (default) is the narrow single-column rhythm the canvas drawer
   * needs; `wide` lets stages spread horizontally (card grids, inline action
   * rows) for the editor's full-width tab.
   */
  layout?: 'stack' | 'wide'
}

export function ComposeFlow({
  slug,
  appSlug,
  initialState,
  initialSources,
  active,
  frameSrcById,
  layout = 'stack',
}: ComposeFlowProps) {
  const flow = useComposeFlow({ slug, initialState, initialSources, active, frameSrcById })
  const wide = layout === 'wide'
  const { st, tab, phase } = flow

  const unlocked: Record<ComposeStage, boolean> = {
    sources: true,
    angles: st.angles.length > 0,
    outline: flow.showOutline,
    content: phase === 'content' || phase === 'visual' || phase === 'done',
  }

  return (
    <div className="space-y-4">
      {flow.error && <Notice tone="red">{flow.error}</Notice>}

      <StageTabs
        tab={tab}
        onSelect={flow.setTab}
        wide={wide}
        unlocked={unlocked}
        counts={{
          sources: flow.sources.length,
          angles: st.angles.length,
          outline: st.outline.length,
          content: st.outline.filter((e) => e.sectionId).length,
        }}
      />

      {st.archived ? (
        <Notice tone="emerald">
          Finished — this is now a normal story. Its sources and outline are{' '}
          <span className="font-medium">retained</span> here for reference and stay
          reopenable.
        </Notice>
      ) : (
        st.attached && (
          <Notice tone="amber">
            Composing into an existing story — materialised sections are{' '}
            <span className="font-medium">appended</span>, leaving your current content untouched.
          </Notice>
        )
      )}

      <div hidden={tab !== 'sources'}>
        <SourcesStage
          sources={flow.sources}
          busy={flow.busy}
          extracted={flow.extracted}
          pending={flow.pending}
          wide={wide}
          appSlug={appSlug}
          onAddUrl={flow.addUrl}
          onAddText={flow.addText}
          onAddFile={flow.addFile}
          onAddFromSource={flow.addFromSource}
          onAddAsset={flow.addAsset}
          onAddFromProvider={flow.addFromProvider}
          onLoadLibrary={flow.loadLibrary}
          onSearchDatasets={flow.searchDatasets}
          onEnrich={flow.addEnrich}
          onRemoveSource={flow.removeSource}
          onReextract={flow.reextract}
          onGenAngles={() => flow.genAngles()}
          onCreateRecap={flow.createRecap}
          onLoadTelemetrySessions={flow.loadTelemetrySessions}
          onCreateTelemetrySource={flow.createTelemetrySource}
        />
      </div>

      {unlocked.angles && (
        <div hidden={tab !== 'angles'}>
          <AnglesStage
            angles={st.angles}
            chosenAngleId={st.chosenAngleId}
            busy={flow.busy}
            wide={wide}
            onPick={flow.pickAngle}
            onRegenerate={flow.genAngles}
            onGenOutline={() => flow.genOutline()}
          />
        </div>
      )}

      {unlocked.outline && (
        <div hidden={tab !== 'outline'} className="space-y-5">
          <OutlineStage
            st={st}
            busy={flow.busy}
            wide={wide}
            outlineEditable={flow.outlineEditable}
            statusEditable={flow.statusEditable}
            newAcceptedCount={flow.newAcceptedCount}
            onCycleStatus={flow.cycleStatus}
            onMove={flow.move}
            onRegenerate={flow.genOutline}
            onRegenSection={flow.regenSection}
            onAddSection={flow.addSection}
            onMaterialize={flow.materialize}
          />
          {flow.charts.length > 0 && (
            <ChartsPanel
              charts={flow.charts}
              results={flow.chartResults}
              errors={flow.chartErrors}
              busy={flow.busy}
              wide={wide}
              onGenerate={flow.genCharts}
              onRetry={flow.retryChart}
              onRegeneratePrompt={flow.regenChartPrompt}
            />
          )}
        </div>
      )}

      {unlocked.content && (
        <div hidden={tab !== 'content'}>
          <SectionsStage
            st={st}
            busy={flow.busy}
            wide={wide}
            writing={flow.writing}
            written={flow.written}
            imgDone={flow.imgDone}
            frameSrcFor={flow.frameSrcFor}
            onWrite={flow.genSection}
            onGenImages={flow.genImages}
          />
        </div>
      )}
    </div>
  )
}

interface PanelProps {
  slug: string
  /** The draft's app slug — forwarded to gate the "Create recap" button. */
  appSlug?: string | null
  initialState: ComposeState
  initialSources: StorySource[]
  /** Controlled visibility. The drawer stays mounted while this toggles so the
   *  research inside survives close → reopen. */
  open: boolean
  onClose: () => void
  /** Signed canvas-frame URLs (keyed by `canvasFrameId`) so materialised
   *  sections show their real render. Passed straight through to `ComposeFlow`. */
  frameSrcById?: Record<string, string>
}

/**
 * Canvas drawer wrapper. Renders the fixed right-side panel; visibility is
 * controlled by `open` (display toggle — NOT conditional mount) so the
 * `ComposeFlow` inside keeps its state when dismissed and reopened.
 */
export function ComposeFlowPanel({
  slug,
  appSlug,
  initialState,
  initialSources,
  open,
  onClose,
  frameSrcById,
}: PanelProps) {
  return (
    <div
      className="fixed right-0 top-0 z-50 flex h-full w-96 flex-col border-l border-white/10 bg-neutral-950/95 text-neutral-100 shadow-2xl backdrop-blur"
      style={{ display: open ? 'flex' : 'none' }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">Research &amp; outline</h2>
          <p className="truncate text-[11px] text-neutral-500">{slug}</p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 leading-none text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-200"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ComposeFlow
          slug={slug}
          appSlug={appSlug}
          initialState={initialState}
          initialSources={initialSources}
          active={open}
          frameSrcById={frameSrcById}
        />
      </div>
    </div>
  )
}

export default ComposeFlowPanel
