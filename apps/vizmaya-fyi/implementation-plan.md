# Story Visualization Web App — Implementation Plan (Revised)

**Stack:** Next.js 14 (App Router) · Tailwind CSS · shadcn/ui · Apache ECharts · Phosphor Icons
**Rendering:** Static Site Generation — markdown files live in the repo, pages built at compile time

---

## 1. How it works

```
content/stories/south-korea-gpu-hour.md  (committed to repo)
        ↓  build time
generateStaticParams()  →  /story/south-korea-gpu-hour
        ↓
Server component reads file from disk
        ↓
markdown-parser.ts  →  Block[]  (typed AST)
        ↓
ComponentRegistry.resolve(block)  →  React component
        ↓
Static HTML + client-side ECharts hydration
        ↓
/story/south-korea-gpu-hour  →  standalone visual story page
```

No file uploads. No runtime parsing. The markdown file **is** the source of truth — edit the file, push to GitHub, the page rebuilds.

---

## 2. Project structure

```
/
├── content/
│   └── stories/
│       ├── south-korea-gpu-hour.md     ← story files live here
│       └── [future-story].md
│
├── app/
│   ├── page.tsx                        ← story index / home
│   └── story/
│       └── [id]/
│           └── page.tsx                ← standalone story page
│
├── components/
│   ├── ui/                             ← shadcn/ui primitives
│   └── story/
│       ├── StoryRenderer.tsx           ← maps Block[] → components
│       ├── Hero.tsx
│       ├── StatBlock.tsx
│       ├── ActHeader.tsx
│       ├── Divider.tsx
│       ├── ProseSection.tsx
│       ├── SubsectionHeader.tsx
│       ├── DataTable.tsx
│       ├── ExposureGrid.tsx
│       ├── ScrollySection.tsx
│       ├── ScenarioToggle.tsx
│       ├── TakeawayGrid.tsx
│       ├── MethodologySection.tsx
│       └── GenericBlock.tsx            ← fallback for unrecognised blocks
│
├── lib/
│   ├── stories.ts                      ← reads MD files from /content/stories
│   ├── markdown-parser.ts              ← MD string → Block[]
│   └── component-registry.ts          ← BlockType → component map
│
└── types/
    └── story.ts                        ← Block, Theme, Frontmatter types
```

---

## 3. Markdown file format

Each story is a `.md` file with YAML frontmatter for metadata and theme:

```md
---
title: "The Quiet Inflation"
subtitle: "How a strait reprices a GPU hour"
byline: "vizmaya · March 2026"
date: "2026-03-01"
theme:
  colors:
    background: "#0a0e14"
    text: "#e0ddd5"
    accent: "#D85A30"
    accent2: "#534AB7"
    teal: "#1D9E75"
    surface: "#111820"
    muted: "#5a6a70"
  fonts:
    serif: "Georgia"
    sans: "Inter"
    mono: "JetBrains Mono"
---

# South Korea Makes the Memory...

*The country that produces...*

**By vizmaya · March 2026**

---

## 18%

South Korea's stock market plunged...
```

The filename becomes the route: `south-korea-gpu-hour.md` → `/story/south-korea-gpu-hour`.

---

## 4. Static generation pattern

```typescript
// app/story/[id]/page.tsx

import { getAllStoryIds, getStoryById } from '@/lib/stories'
import { parseMarkdown } from '@/lib/markdown-parser'
import StoryRenderer from '@/components/story/StoryRenderer'

// Runs at build time — generates one static page per .md file
export async function generateStaticParams() {
  const ids = await getAllStoryIds() // reads /content/stories/*.md
  return ids.map(id => ({ id }))
}

// Runs at build time for each story
export default async function StoryPage({ params }: { params: { id: string } }) {
  const { frontmatter, content } = await getStoryById(params.id)
  const blocks = parseMarkdown(content)

  return (
    <StoryRenderer
      blocks={blocks}
      theme={frontmatter.theme}
      meta={frontmatter}
    />
  )
}
```

```typescript
// lib/stories.ts — runs on the server / Node at build time

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const STORIES_DIR = path.join(process.cwd(), 'content/stories')

export async function getAllStoryIds(): Promise<string[]> {
  return fs.readdirSync(STORIES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
}

export async function getStoryById(id: string) {
  const file = fs.readFileSync(path.join(STORIES_DIR, `${id}.md`), 'utf8')
  const { data: frontmatter, content } = matter(file)
  return { frontmatter, content }
}
```

---

## 5. Block types and parser rules

The parser reads the markdown string top-to-bottom and classifies contiguous sections:

| Markdown pattern | Block type | Component |
|---|---|---|
| First `# Heading` + italic + bold byline | `hero` | `Hero.tsx` |
| `## XX%` or `## NUMBER` (short = a stat) | `stat-block` | `StatBlock.tsx` |
| `## Act I:`, `## Act II:` | `act-header` | `ActHeader.tsx` |
| `---` | `divider` | `Divider.tsx` |
| `\| col \| col \|` rows | `data-table` | `DataTable.tsx` → ECharts bar |
| Multiple `data-table` blocks grouped with scenario labels | `scenario-toggle` | `ScenarioToggle.tsx` → ECharts |
| Consecutive `### ` sections with dense prose | `scrolly-section` | `ScrollySection.tsx` |
| `## What to watch` + bold audience labels | `takeaway-grid` | `TakeawayGrid.tsx` |
| `## Methodology` / `## Sources` | `methodology` | `MethodologySection.tsx` |
| `*italic line at end*` | `footer` | inline |
| Any other `### Heading` | `subsection-header` | `SubsectionHeader.tsx` |
| Body paragraphs | `prose` | `ProseSection.tsx` |
| Anything unrecognised | `unknown` | `GenericBlock.tsx` |

---

## 6. Component structure for /story/[id]

The rendered page matches the visual structure of the sample HTML:

```
<StoryPage>
  <ThemeProvider theme={...}>          ← injects CSS vars to :root
    <Hero />                           ← full-viewport intro
    <Divider />
    <StatBlock />                      ← big centered number
    <ActHeader />                      ← "Act I — title"
    <ProseSection />                   ← body text, inline highlights
    <ScrollySection>                   ← sticky chart + step cards
      <EChartsBar />                   ← client component
    </ScrollySection>
    <ScenarioToggle>                   ← 60-day / 6-month / 3-5yr tabs
      <EChartsGroupedBar />
    </ScenarioToggle>
    <TakeawayGrid />                   ← "What to watch" cards
    <MethodologySection />
  </ThemeProvider>
</StoryPage>
```

**Server vs. client boundary:**
- Everything above is a **server component** (rendered to static HTML at build)
- `EChartsBar`, `EChartsGroupedBar`, `ScenarioToggle` are `'use client'` components
- ECharts is dynamically imported: `dynamic(() => import('echarts-for-react'), { ssr: false })`

---

## 7. Theme system

Theme values from frontmatter are written as CSS custom properties on `:root`. Tailwind classes reference these vars for story components (not the app shell).

```tsx
// ThemeProvider.tsx — server component
export function ThemeProvider({ theme, children }) {
  const vars = {
    '--color-bg': theme.colors.background,
    '--color-text': theme.colors.text,
    '--color-accent': theme.colors.accent,
    '--color-accent2': theme.colors.accent2,
    '--color-surface': theme.colors.surface,
    '--color-muted': theme.colors.muted,
    '--font-serif': theme.fonts.serif,
    '--font-sans': theme.fonts.sans,
    '--font-mono': theme.fonts.mono,
  }
  return (
    <div style={vars as React.CSSProperties}>
      {children}
    </div>
  )
}
```

Each story component uses `var(--color-accent)` etc., so swapping frontmatter colours re-themes the entire page with no code changes.

---

## 8. ECharts — chart generation from tables

Tables in the markdown are parsed into structured data and rendered as ECharts configs:

```typescript
// Example: markdown table → ECharts horizontal bar config
function tableToBarConfig(table: TableBlock, theme: Theme): EChartsOption {
  return {
    backgroundColor: 'transparent',
    xAxis: { type: 'value', axisLabel: { color: theme.colors.muted } },
    yAxis: { type: 'category', data: table.rows.map(r => r[0]) },
    series: [{
      type: 'bar',
      data: table.rows.map(r => parseFloat(r[1])),
      itemStyle: { color: theme.colors.accent },
    }],
  }
}
```

The `DataTable` component decides whether to render a visual table or an ECharts bar chart based on the data shape (numeric % column → chart; mixed text → table).

---

## 9. Story index page

`app/page.tsx` lists all stories from `content/stories/`:

```
/
├── The Quiet Inflation — Hormuz GPU Hour      March 2026
├── [Next story]
└── ...
```

Each card links to `/story/[id]`. Built statically at compile time.

---

## 10. Build phases

### Phase 1 — Scaffold
- Next.js 14 + Tailwind + shadcn/ui + Phosphor setup
- `content/stories/` directory with the sample `.md` file
- `lib/stories.ts` — file reader with gray-matter
- Basic `app/story/[id]/page.tsx` with `generateStaticParams`
- Verify the route renders with raw content

### Phase 2 — Parser
- `lib/markdown-parser.ts` — full rules-based block classifier
- Cover all block types using the sample story as test input
- Output: `Block[]` with typed content payloads

### Phase 3 — Component library
- All 12 named story components
- `ThemeProvider` wiring CSS variables from frontmatter
- `StoryRenderer.tsx` mapping blocks to components
- Story renders end-to-end (no charts yet)

### Phase 4 — ECharts integration
- `DataTable.tsx` → horizontal bar chart
- `ScenarioToggle.tsx` → tabbed grouped bar chart with animated transitions
- Chart theming from CSS vars

### Phase 5 — ScrollySection
- Intersection Observer for scroll-triggered step activation
- Sticky chart panel + narrative step cards
- Smooth step transitions

### Phase 6 — Story index + polish
- `app/page.tsx` story listing
- Scroll animations on StatBlock and ProseSection
- Responsive layout (mobile → single column)
- `<head>` metadata from frontmatter (OG tags, title)
- Google Fonts loaded per-story from frontmatter font names

---

## 11. Adding a new story

1. Create `content/stories/my-new-story.md`
2. Add frontmatter (title, theme, byline, date)
3. Write the story in markdown using the supported patterns
4. `npm run build` — Next.js generates `/story/my-new-story` automatically
5. Push to GitHub → CI rebuilds and deploys

Any block type not recognised by the parser renders via `GenericBlock` (plain styled prose), and is visible in the build log as a candidate for a new component.

---

## 12. Key dependencies

| Package | Purpose |
|---|---|
| `gray-matter` | YAML frontmatter parsing |
| `echarts` + `echarts-for-react` | Data charts |
| `@phosphor-icons/react` | Icons |
| `shadcn/ui` | App shell UI primitives |
| `tailwindcss` | Styling |
| `next` 14 | SSG + App Router |

---

*No backend. No database. No uploads. The markdown file is the CMS.*
