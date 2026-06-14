import { Fragment, type ReactNode } from 'react'
import { FS_FENCE_OPEN, FENCE_CLOSE, parseFsBody } from '@vismay/viz-engine'
import { RecapVizBlock } from './RecapVizBlock'

/**
 * Markdown renderer scoped to the shape footshorts' worker/src/recap.ts emits:
 * h1/h2/h3, paragraphs, italic meta lines, (optionally nested) bullet lists with
 * **bold**, *italic* / _italic_, [links](url) and ![](url) story thumbnails —
 * plus embedded `fs:` viz directives (see @vismay/viz-engine recapFences):
 *
 *   ```fs:match-card
 *   { "layout": "score", "home": "Arsenal", "away": "Chelsea", "score": "2 – 1" }
 *   ```
 *
 * Each such fence is mounted as a live module via RecapVizBlock, interleaved with
 * prose in document order. A fence whose body fails to parse degrades to a plain
 * code block rather than throwing. Not a general markdown parser — it handles only
 * what the recap generator produces, so the apps don't pull in a markdown dep.
 *
 * Shared by the admin and footshorts/web recap viewers so they can't drift.
 */

// Inline tokens. The image token is listed first so `![](url)` wins over the plain
// link token at the same `[`, and links beat any `_`/`*` inside their URL (leftmost
// match).
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${keyBase}-${i++}`
    const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(tok)
    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)
    if (imgMatch) {
      nodes.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={imgMatch[2]}
          alt={imgMatch[1]}
          loading="lazy"
          className="mr-2 inline-block h-9 w-14 rounded border border-white/10 object-cover align-middle"
        />,
      )
    } else if (linkMatch) {
      nodes.push(
        <a
          key={key}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          className="text-sky-400 underline decoration-sky-400/40 underline-offset-2 hover:decoration-sky-400"
        >
          {linkMatch[1]}
        </a>,
      )
    } else if (tok.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-white">
          {tok.slice(2, -2)}
        </strong>,
      )
    } else if (tok.startsWith('*') || tok.startsWith('_')) {
      nodes.push(
        <em key={key} className="text-neutral-400">
          {tok.slice(1, -1)}
        </em>,
      )
    } else {
      nodes.push(tok)
    }
    last = m.index + tok.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

type ListItem = { depth: number; text: string }

export function RecapMarkdown({ markdown }: { markdown: string }) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let listBuffer: ListItem[] = []
  let k = 0

  const flushList = () => {
    if (listBuffer.length === 0) return
    const items = listBuffer
    listBuffer = []
    blocks.push(
      <ul key={`ul-${k++}`} className="mb-4 space-y-1.5">
        {items.map((it, idx) => (
          <li
            key={idx}
            className="text-sm leading-relaxed text-neutral-200"
            style={{ marginLeft: it.depth * 16 }}
          >
            <span className="mr-2 text-neutral-500">{it.depth > 0 ? '◦' : '•'}</span>
            {renderInline(it.text, `li-${k}-${idx}`)}
          </li>
        ))}
      </ul>,
    )
  }

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!

    // `fs:` viz fence — collect the body up to the closing fence and mount it.
    const fence = FS_FENCE_OPEN.exec(raw)
    if (fence) {
      flushList()
      const type = fence[1]!
      const body: string[] = []
      let j = li + 1
      for (; j < lines.length; j++) {
        if (FENCE_CLOSE.test(lines[j]!)) break
        body.push(lines[j]!)
      }
      li = j // resume after the closing fence (or EOF)
      const parsed = parseFsBody(type, body.join('\n'))
      if (parsed) {
        blocks.push(<RecapVizBlock key={`fs-${k++}`} type={parsed.type} config={parsed.config} />)
      } else {
        // Malformed body: show it as a plain code block instead of crashing.
        blocks.push(
          <pre
            key={`pre-${k++}`}
            className="my-3 overflow-x-auto rounded-md border border-white/10 bg-black/30 p-3 text-xs text-neutral-300"
          >
            <code>{[`\`\`\`${type}`, ...body, '```'].join('\n')}</code>
          </pre>,
        )
      }
      continue
    }

    const line = raw.replace(/\s+$/, '')
    if (line.trim() === '') {
      flushList()
      continue
    }

    const liMatch = /^(\s*)-\s+(.*)$/.exec(line)
    if (liMatch) {
      const depth = Math.min(1, Math.floor(liMatch[1].length / 2))
      listBuffer.push({ depth, text: liMatch[2] })
      continue
    }
    flushList()

    if (line.startsWith('### ')) {
      blocks.push(
        <h3 key={`h-${k++}`} className="mb-1 mt-5 text-base font-semibold text-white">
          {renderInline(line.slice(4), `h3-${k}`)}
        </h3>,
      )
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h2
          key={`h-${k++}`}
          className="mb-2 mt-7 border-b border-white/10 pb-1 text-sm font-bold uppercase tracking-wide text-sky-400"
        >
          {renderInline(line.slice(3), `h2-${k}`)}
        </h2>,
      )
    } else if (line.startsWith('# ')) {
      blocks.push(
        <h1 key={`h-${k++}`} className="mb-2 text-xl font-bold text-white">
          {renderInline(line.slice(2), `h1-${k}`)}
        </h1>,
      )
    } else {
      blocks.push(
        <p key={`p-${k++}`} className="mb-3 text-sm leading-relaxed text-neutral-200">
          {renderInline(line, `p-${k}`)}
        </p>,
      )
    }
  }
  flushList()

  return <div>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}
