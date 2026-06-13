/**
 * Capture/embed route: render ONE viz module from an arbitrary config.
 *
 * Backs the @vismay/mcp tools `embed_url` (returns this URL) and
 * `render_module_image` (headless-screenshots it). Unlike the catalog `/[type]`
 * preview, this accepts a caller-supplied config and emits the readiness signal
 * (window.__pdfReady__ via useStoryReadiness in EmbedModule) so a screenshot
 * fires only once the module is painted.
 *
 *   /embed/<type>?config=<base64url JSON>&slot=foreground&bg=surface|transparent
 *
 * The module fills the viewport inside `[data-embed-root]`, which the screenshot
 * routine targets as its bounding box.
 */

import EmbedModule from '@/components/EmbedModule'

interface PageProps {
  params: Promise<{ type: string }>
  searchParams: Promise<{ config?: string; slot?: string; bg?: string }>
}

function decodeConfig(encoded: string | undefined): { config: unknown; error: string | null } {
  if (!encoded) return { config: {}, error: null }
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8')
    return { config: JSON.parse(json), error: null }
  } catch (e) {
    return { config: {}, error: e instanceof Error ? e.message : String(e) }
  }
}

export default async function EmbedPage({ params, searchParams }: PageProps) {
  const { type: encodedType } = await params
  const { config: encodedConfig, bg } = await searchParams
  const type = decodeURIComponent(encodedType)
  const { config, error } = decodeConfig(encodedConfig)

  const transparent = bg === 'transparent'
  const background = transparent ? 'transparent' : 'var(--color-surface)'

  return (
    <>
      {/* Neutralize the layout body background so transparent captures get alpha. */}
      <style>{`html,body{background:${background} !important;margin:0;padding:0;}`}</style>
      <div
        data-embed-root
        style={{
          position: 'relative',
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          background,
        }}
      >
        {error ? (
          <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 12 }}>
            Bad config param: {error}
          </div>
        ) : (
          <EmbedModule type={type} config={config} />
        )}
      </div>
    </>
  )
}
