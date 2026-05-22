import type { Monaco } from '@monaco-editor/react'
import { chartSchema } from '@vismay/content-source/schemas'

let languagesConfigured = false

/** No-op placeholder kept for API symmetry. Monaco's built-in JSON, YAML
 *  (Monarch), and Markdown highlighting do NOT require any worker beyond the
 *  base `editorWorkerService`, which the default CDN loader from
 *  `@monaco-editor/react` provides. JSON schema validation is performed
 *  in-process by the built-in `jsonDefaults` provider (configured below) —
 *  also worker-free. */
export function installMonacoWorkers() {
  // intentionally empty
}

/** Define the dark theme and register the JSON Schema for chart files.
 *  Called from `beforeMount`. */
export function configureMonacoLanguages(monaco: Monaco) {
  if (languagesConfigured) return
  languagesConfigured = true

  monaco.editor.defineTheme('vizmaya-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0a0a0a',
      'editor.foreground': '#f5f5f5',
      'editorLineNumber.foreground': '#3f3f46',
      'editorLineNumber.activeForeground': '#a1a1aa',
      'editor.lineHighlightBackground': '#171717',
      'editorIndentGuide.background1': '#1f1f1f',
      'editorIndentGuide.activeBackground1': '#3f3f46',
      'editorBracketMatch.background': '#262626',
      'editorBracketMatch.border': '#404040',
      'editor.selectionBackground': '#404040',
      'editor.inactiveSelectionBackground': '#262626',
      'editorCursor.foreground': '#f5f5f5',
      'editorWhitespace.foreground': '#262626',
      'editorGutter.background': '#0a0a0a',
      'scrollbarSlider.background': '#26262680',
      'scrollbarSlider.hoverBackground': '#404040cc',
      'scrollbarSlider.activeBackground': '#525252',
    },
  })

  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    schemas: [
      {
        uri: 'vismay://schemas/chart.schema.json',
        fileMatch: ['*.json'],
        schema: chartSchema as object,
      },
    ],
  })
}
