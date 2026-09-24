import { EDITION_CSS_VARS, type AiDataCentersTheme } from '../../../ai-data-centers/theme'

/**
 * Emits the epic row's theme overrides as CSS custom properties on the
 * edition root. The stylesheet carries the defaults (dark + light); this only
 * writes the keys an editor changed in the admin, so the override mechanics
 * of app/ai-data-centers/theme.ts keep working for the edition page too.
 */
export default function EditionThemeStyle({ overrides }: { overrides: Partial<AiDataCentersTheme> }) {
  const decls: string[] = []
  for (const [key, value] of Object.entries(overrides)) {
    const cssVar = EDITION_CSS_VARS[key as keyof AiDataCentersTheme]
    if (cssVar && value) decls.push(`${cssVar}:${value}`)
  }
  if (decls.length === 0) return null
  // Values are validated hex strings (resolveAiDataCentersTheme), never user HTML.
  return <style dangerouslySetInnerHTML={{ __html: `.dcd{${decls.join(';')}}` }} />
}
