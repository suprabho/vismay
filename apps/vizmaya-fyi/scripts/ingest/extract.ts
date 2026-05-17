import fs from 'fs'
import path from 'path'

/**
 * Format-agnostic extractor. Returns clean text the structurer can feed
 * to an LLM. `body` uses light Markdown (paragraphs separated by blank
 * lines, tables preserved where possible) — anything downstream should
 * treat it as untrusted prose, not as a validated format.
 */
export interface ExtractedSource {
  title: string
  byline?: string
  body: string
  /** Any detected tables, kept so the structurer can lift them into charts. */
  tables?: Array<{ headers: string[]; rows: string[][] }>
}

export async function extract(inputPath: string): Promise<ExtractedSource> {
  const ext = path.extname(inputPath).toLowerCase()
  const buf = fs.readFileSync(inputPath)
  switch (ext) {
    case '.pdf':
      return extractPdf(buf)
    case '.eml':
      return extractEml(buf)
    case '.html':
    case '.htm':
      return extractHtml(buf.toString('utf8'))
    case '.md':
    case '.markdown':
    case '.txt':
      return extractText(buf.toString('utf8'))
    default:
      throw new Error(`unsupported input format: ${ext}`)
  }
}

async function extractPdf(buf: Buffer): Promise<ExtractedSource> {
  // pdf-parse 2.x exposes a PDFParse class (not a default function).
  // Signature: new PDFParse({ data: Uint8Array }); then await getText() / getInfo().
  const mod = (await import('pdf-parse')) as unknown as {
    PDFParse: new (opts: { data: Uint8Array }) => {
      getText(): Promise<{ text: string }>
      getInfo(): Promise<{ info?: { Title?: string } }>
      destroy(): Promise<void>
    }
  }
  // The PDF worker transfers the Uint8Array on the first call, so we can
  // only extract one thing per parser instance. Text is the only required
  // output — title falls back to the first non-empty line.
  const parser = new mod.PDFParse({ data: new Uint8Array(buf) })
  try {
    const { text } = await parser.getText()
    const { title, byline, body } = splitTitleAndByline(text)
    return { title: title || 'Untitled', byline, body }
  } finally {
    await parser.destroy()
  }
}

async function extractEml(buf: Buffer): Promise<ExtractedSource> {
  const { simpleParser } = await import('mailparser')
  const mail = await simpleParser(buf)
  // Prefer HTML if present — articles embedded in email often have structure
  // that collapses badly when read from the plaintext alternative.
  if (mail.html) {
    const html = await extractHtml(mail.html)
    return {
      title: html.title || mail.subject || 'Untitled',
      byline: html.byline || (mail.from?.text ?? undefined),
      body: html.body,
    }
  }
  const text = mail.text ?? ''
  const { title, byline, body } = splitTitleAndByline(text)
  return {
    title: title || mail.subject || 'Untitled',
    byline: byline || mail.from?.text,
    body,
  }
}

async function extractHtml(html: string): Promise<ExtractedSource> {
  const { JSDOM } = await import('jsdom')
  const { Readability } = await import('@mozilla/readability')
  const dom = new JSDOM(html, { url: 'https://example.com/' })
  const article = new Readability(dom.window.document).parse()
  const body = htmlToMarkdownish(article?.content ?? '')
  return {
    title: article?.title ?? 'Untitled',
    byline: article?.byline ?? undefined,
    body,
  }
}

async function extractText(raw: string): Promise<ExtractedSource> {
  const { title, byline, body } = splitTitleAndByline(raw)
  return { title: title || 'Untitled', byline, body }
}

/**
 * First non-empty line → title. If the next non-empty line is short and
 * contains `By` or ends with a date-looking token, it's treated as the
 * byline. Everything else is body.
 */
function splitTitleAndByline(raw: string): {
  title: string
  byline?: string
  body: string
} {
  const lines = raw.split(/\r?\n/).map((l) => l.trim())
  let i = 0
  while (i < lines.length && lines[i] === '') i++
  const title = lines[i] ?? ''
  i++
  while (i < lines.length && lines[i] === '') i++

  let byline: string | undefined
  const candidate = lines[i] ?? ''
  if (
    candidate.length > 0 &&
    candidate.length < 140 &&
    (/^by\s/i.test(candidate) || /\b20\d{2}\b/.test(candidate))
  ) {
    byline = candidate
    i++
    while (i < lines.length && lines[i] === '') i++
  }

  const body = lines.slice(i).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return { title, byline, body }
}

/**
 * Strip the most common HTML blocks and keep paragraph + heading structure.
 * We don't need a full markdown converter — the LLM tolerates imperfect
 * input as long as paragraph breaks survive.
 */
function htmlToMarkdownish(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<h([1-6])[^>]*>/gi, (_, lvl) => `\n\n${'#'.repeat(Number(lvl))} `)
    .replace(/<\/h[1-6]\s*>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
