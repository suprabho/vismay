// Typecheck-only stub for `@vismay/content-source/storySection`.
//
// Like the viz-engine stubs: content-source is consumed as source, and its
// `yamlSections` helper isn't written against this package's stricter tsconfig
// (noUncheckedIndexedAccess). Runtime resolves the real module; this keeps our
// isolated typecheck from compiling content-source internals.

export interface NewSection {
  heading: string
  paragraphs: string[]
  kind?: string
  body?: Record<string, unknown>
}

export interface AppendSectionResult {
  markdown: string
  configYaml: string
  id: string
}

export declare function appendStorySection(
  markdown: string,
  configYaml: string,
  section: NewSection,
): AppendSectionResult
