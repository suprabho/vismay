/**
 * Loads the per-card Google Fonts stylesheets so each themed card renders in
 * its own typefaces. Pass the deduped font URLs resolved from the cards' themes
 * (e.g. via `getFontImportUrl` from `@vismay/content-source/getFontImports`).
 */
export function StoryGridFonts({ fontUrls }: { fontUrls: string[] }) {
  return (
    <>
      {fontUrls.map((u) => (
        <link key={u} href={u} rel="stylesheet" />
      ))}
    </>
  )
}

export default StoryGridFonts
