import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/**
 * Minimal frontmatter helpers so the admin editor can round-trip the theme
 * (and any other frontmatter key) without pulling gray-matter into the client
 * bundle. Uses the `yaml` package that's already a dependency.
 *
 * Comments inside the frontmatter block are lost on re-serialize. Acceptable
 * for theme edits since the frontmatter is key-value metadata — the body of
 * the .md file (where comments matter more) is untouched.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export interface ParsedMarkdown {
  data: Record<string, unknown>
  body: string
  hadFrontmatter: boolean
}

export function parseFrontmatter(md: string): ParsedMarkdown {
  const m = md.match(FRONTMATTER_RE)
  if (!m) return { data: {}, body: md, hadFrontmatter: false }
  // The admin editor calls this on every keystroke, so YAML may be transiently
  // invalid (unclosed string, hanging key) — swallow parse errors so the
  // editor doesn't unmount mid-edit.
  let data: Record<string, unknown> | null = null
  try {
    data = parseYaml(m[1]) as Record<string, unknown> | null
  } catch {
    data = null
  }
  return {
    data: data && typeof data === 'object' ? data : {},
    body: m[2] ?? '',
    hadFrontmatter: true,
  }
}

export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  // Match existing stories' style: double-quoted strings, default indent.
  const yaml = stringifyYaml(data, {
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
    lineWidth: 0,
  }).trimEnd()
  return `---\n${yaml}\n---\n${body.startsWith('\n') ? body : '\n' + body}`
}
