/**
 * Pure HTML assembly for the newsletter render surface. No DOM, no React —
 * the render worker calls these with captured image URLs and uploads the
 * returned strings.
 *
 * Two variants from one block list:
 *
 *   - `buildEmailHtml`    a self-contained, inline-styled, single-column
 *     600px document that survives email clients (Gmail, Apple Mail,
 *     Outlook-ish). This is the canonical `newsletter.html` artifact and
 *     doubles as the browser preview.
 *
 *   - `buildSubstackHtml` a minimal semantic document (h2/h3, p, figure,
 *     blockquote, hr, a) matched to what Substack's editor keeps when rich
 *     HTML is pasted in. Substack re-uploads any absolutely-referenced
 *     images to its own CDN on paste, so the captured PNGs travel with the
 *     post. Title/subtitle are deliberately NOT in the body — they belong
 *     in Substack's own title/subtitle fields.
 *
 * Both variants receive markdown-ish paragraph strings (the same slices the
 * story reader shows) and convert only the inline subset that appears in
 * story prose: **bold**, *italic*, [link](url).
 */

import type { NewsletterConfig } from './storyNewsletterConfig'

export interface NewsletterHtmlImage {
  /** Absolute public URL of the captured PNG (cache-busted by the caller). */
  url: string
  kind: 'map' | 'viz' | 'panel'
}

export interface NewsletterHtmlBlock {
  /** Section kind — 'hero' | 'stat' | 'bigStat' | 'quote' | 'text' | … */
  kind: string
  eyebrow?: string
  heading?: string
  subheading?: string
  paragraphs: string[]
  caption?: string
  images: NewsletterHtmlImage[]
}

export interface NewsletterHtmlInput {
  title: string
  subtitle?: string
  byline?: string
  /** Canonical interactive-story URL — the CTA + footer link target. */
  storyUrl: string
  /** Accent color from the story theme; falls back to a neutral indigo. */
  accentColor?: string
  config: NewsletterConfig
  blocks: NewsletterHtmlBlock[]
}

// ---------------------------------------------------------------------------
// Inline markdown → HTML (escape first, then the tiny prose subset).

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeHref(url: string): string | null {
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed
  return null
}

/** Convert the inline markdown subset used in story prose. Input is raw
 *  authored text; output is escaped HTML with strong/em/a tags. */
export function inlineMarkdownToHtml(text: string): string {
  let out = escapeHtml(text)
  // Links first so their labels can still carry bold/italic.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => {
    const href = safeHref(url)
    if (!href) return label
    return `<a href="${escapeHtml(href)}">${label}</a>`
  })
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return out
}

/** Split a free-text field (intro/outro) into paragraphs on blank lines. */
function splitParagraphs(text: string | undefined): string[] {
  if (!text) return []
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
}

function isStatKind(kind: string): boolean {
  return kind === 'stat' || kind === 'bigStat'
}

function isQuoteKind(kind: string): boolean {
  return kind === 'quote'
}

// ---------------------------------------------------------------------------
// Email variant

const FONT_SERIF = `Georgia, 'Times New Roman', serif`
const FONT_SANS = `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
const COLOR_TEXT = '#1a1a1f'
const COLOR_MUTED = '#6b6b76'
const COLOR_LINE = '#e6e6ea'
const COLOR_PAGE = '#f4f4f6'
const DEFAULT_ACCENT = '#3a3a9c'

function emailImage(img: NewsletterHtmlImage, alt: string): string {
  return (
    `<img src="${escapeHtml(img.url)}" alt="${escapeHtml(alt)}" width="600" ` +
    `style="display:block;width:100%;height:auto;border:0;border-radius:6px;" />`
  )
}

function emailCaption(caption: string): string {
  return (
    `<p style="margin:6px 0 0;font-family:${FONT_SANS};font-size:12px;` +
    `line-height:1.5;color:${COLOR_MUTED};">${inlineMarkdownToHtml(caption)}</p>`
  )
}

function emailParagraph(p: string): string {
  return (
    `<p style="margin:0 0 14px;font-family:${FONT_SANS};font-size:15px;` +
    `line-height:1.65;color:${COLOR_TEXT};">${inlineMarkdownToHtml(p)}</p>`
  )
}

export function buildEmailHtml(input: NewsletterHtmlInput): string {
  const accent = input.accentColor || DEFAULT_ACCENT
  const cfg = input.config
  const subject = cfg.subject || input.title
  const ctaLabel = cfg.cta?.label || 'Read the full interactive story'
  const ctaUrl = safeHref(cfg.cta?.url ?? '') || input.storyUrl

  const parts: string[] = []

  for (const block of input.blocks) {
    const cells: string[] = []

    if (block.eyebrow) {
      cells.push(
        `<p style="margin:0 0 8px;font-family:${FONT_SANS};font-size:11px;` +
          `letter-spacing:0.16em;text-transform:uppercase;color:${accent};">` +
          `${inlineMarkdownToHtml(block.eyebrow)}</p>`
      )
    }

    if (isStatKind(block.kind) && block.heading) {
      // Stat sections carry the big number in `heading`; render it large in
      // the accent color with the paragraphs as its caption.
      cells.push(
        `<p style="margin:0 0 4px;font-family:${FONT_SERIF};font-size:44px;` +
          `line-height:1.1;font-weight:700;color:${accent};">` +
          `${inlineMarkdownToHtml(block.heading)}</p>`
      )
    } else if (block.heading) {
      cells.push(
        `<h2 style="margin:0 0 8px;font-family:${FONT_SERIF};font-size:24px;` +
          `line-height:1.25;font-weight:700;color:${COLOR_TEXT};">` +
          `${inlineMarkdownToHtml(block.heading)}</h2>`
      )
    }

    if (block.subheading) {
      cells.push(
        `<p style="margin:0 0 12px;font-family:${FONT_SANS};font-size:16px;` +
          `line-height:1.5;color:${COLOR_MUTED};">${inlineMarkdownToHtml(block.subheading)}</p>`
      )
    }

    for (const img of block.images) {
      cells.push(
        `<div style="margin:4px 0 12px;">` +
          emailImage(img, block.heading ?? input.title) +
          (block.caption ? emailCaption(block.caption) : '') +
          `</div>`
      )
    }

    if (isQuoteKind(block.kind) && block.paragraphs.length > 0) {
      cells.push(
        `<blockquote style="margin:0 0 14px;padding:4px 0 4px 16px;` +
          `border-left:3px solid ${accent};font-family:${FONT_SERIF};` +
          `font-size:18px;line-height:1.5;font-style:italic;color:${COLOR_TEXT};">` +
          block.paragraphs.map((p) => inlineMarkdownToHtml(p)).join('<br /><br />') +
          `</blockquote>`
      )
    } else {
      for (const p of block.paragraphs) cells.push(emailParagraph(p))
    }

    if (cells.length > 0) {
      parts.push(
        `<tr><td style="padding:20px 32px 8px;">${cells.join('\n')}</td></tr>`
      )
    }
  }

  const introHtml = splitParagraphs(cfg.intro).map(emailParagraph).join('\n')
  const outroHtml = splitParagraphs(cfg.outro).map(emailParagraph).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR_PAGE};">
${
  cfg.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(cfg.preheader)}</div>`
    : ''
}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR_PAGE};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:10px;overflow:hidden;">
<tr><td style="padding:28px 32px 0;">
  <p style="margin:0 0 16px;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:${COLOR_MUTED};">
    <a href="${escapeHtml(ctaUrl)}" style="color:${COLOR_MUTED};text-decoration:none;">Vizmaya</a>
  </p>
  <h1 style="margin:0 0 10px;font-family:${FONT_SERIF};font-size:32px;line-height:1.2;font-weight:700;color:${COLOR_TEXT};">${inlineMarkdownToHtml(input.title)}</h1>
  ${
    input.subtitle
      ? `<p style="margin:0 0 10px;font-family:${FONT_SANS};font-size:17px;line-height:1.5;color:${COLOR_MUTED};">${inlineMarkdownToHtml(input.subtitle)}</p>`
      : ''
  }
  ${
    input.byline
      ? `<p style="margin:0 0 6px;font-family:${FONT_SANS};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:${COLOR_MUTED};">${inlineMarkdownToHtml(input.byline)}</p>`
      : ''
  }
</td></tr>
${introHtml ? `<tr><td style="padding:12px 32px 0;">${introHtml}</td></tr>` : ''}
<tr><td style="padding:8px 32px 0;"><div style="border-top:1px solid ${COLOR_LINE};"></div></td></tr>
${parts.join('\n')}
${outroHtml ? `<tr><td style="padding:20px 32px 0;">${outroHtml}</td></tr>` : ''}
<tr><td align="center" style="padding:24px 32px 8px;">
  <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 28px;background:${accent};color:#ffffff;font-family:${FONT_SANS};font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(ctaLabel)} &rarr;</a>
</td></tr>
<tr><td style="padding:20px 32px 28px;">
  <div style="border-top:1px solid ${COLOR_LINE};padding-top:16px;">
    <p style="margin:0;font-family:${FONT_SANS};font-size:12px;line-height:1.6;color:${COLOR_MUTED};">
      Maps, charts and figures are stills from the interactive story —
      <a href="${escapeHtml(ctaUrl)}" style="color:${accent};">explore the live version</a>.
    </p>
  </div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`
}

// ---------------------------------------------------------------------------
// Substack variant

function substackParagraph(p: string): string {
  return `<p>${inlineMarkdownToHtml(p)}</p>`
}

export function buildSubstackHtml(input: NewsletterHtmlInput): string {
  const cfg = input.config
  const ctaLabel = cfg.cta?.label || 'Read the full interactive story'
  const ctaUrl = safeHref(cfg.cta?.url ?? '') || input.storyUrl

  const body: string[] = []

  for (const p of splitParagraphs(cfg.intro)) body.push(substackParagraph(p))

  for (const block of input.blocks) {
    if (isStatKind(block.kind) && block.heading) {
      body.push(`<h2>${inlineMarkdownToHtml(block.heading)}</h2>`)
      for (const p of block.paragraphs) {
        body.push(`<p><em>${inlineMarkdownToHtml(p)}</em></p>`)
      }
    } else {
      if (block.heading) body.push(`<h3>${inlineMarkdownToHtml(block.heading)}</h3>`)
      if (block.subheading) {
        body.push(`<p><em>${inlineMarkdownToHtml(block.subheading)}</em></p>`)
      }
      if (isQuoteKind(block.kind) && block.paragraphs.length > 0) {
        body.push(
          `<blockquote>${block.paragraphs.map(substackParagraph).join('')}</blockquote>`
        )
      } else {
        for (const p of block.paragraphs) body.push(substackParagraph(p))
      }
    }

    for (const img of block.images) {
      const alt = escapeHtml(block.heading ?? input.title)
      body.push(
        `<figure><img src="${escapeHtml(img.url)}" alt="${alt}" />` +
          (block.caption
            ? `<figcaption>${inlineMarkdownToHtml(block.caption)}</figcaption>`
            : '') +
          `</figure>`
      )
    }
  }

  for (const p of splitParagraphs(cfg.outro)) body.push(substackParagraph(p))

  body.push(`<p><strong><a href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaLabel)} →</a></strong></p>`)

  // A full document (not a fragment) so the artifact opens standalone in a
  // browser and Substack's "import a post from URL" can consume it too. The
  // paste path only carries the <body> children through the clipboard.
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(cfg.subject || input.title)}</title>
</head>
<body>
${body.join('\n')}
</body>
</html>
`
}
