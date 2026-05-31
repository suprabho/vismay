# Markdown-Only Content Implementation for Apex

## 1. Goal
Use `.md` files as the single source of truth for stories, signals, and page content instead of a database.

This approach keeps content in Git, supports PR-based editing, and avoids backend database complexity.

## 2. Recommended Architecture
- Content source: Markdown files in repo.
- Build/parser layer: converts Markdown + frontmatter to typed JSON.
- Delivery options:
  - Static (preferred for current app): prebuild JSON in `public/data`.
  - Runtime API (optional): server endpoint reads parsed content.
- Frontend: fetches structured JSON, not raw `.md` directly.

## 3. Suggested Content Folder Structure

```text
Frontend/
  content/
    stories/
      2026-05-02-the-anatomy-of-an-undercut.md
      2026-04-28-floor-development-underfloor-war.md
    signals/
      monza-p1-2026.md
    ui/
      magazine-page.md
      story-detail.md
  scripts/
    build-content.mjs
  public/
    data/
      stories.json
      story-index.json
      signals.json
      ui-config.json
```

## 4. Markdown Schema Design

## 4.1 Story File (`content/stories/*.md`)
Use YAML frontmatter for metadata and body for article content.

```md
---
slug: the-anatomy-of-an-undercut
status: published
category: Strategy
title: The Anatomy of an Undercut
summary: A granular breakdown of the crucial three laps where the race was won.
publishedAt: 2026-05-02
readTimeMin: 6
coverImage:
  url: https://cdn.example.com/stories/undercut-cover.jpg
  alt: Undercut strategy visual
telemetry:
  enabled: true
  title: Telemetry Delta / Turn 14 Approach
  driverALabel: DRIVER A
  driverBLabel: DRIVER B
  earlyLiftLabel: EARLY LIFT (-15M)
  throttleLabel: THROTTLE APP. (+0.2S)
  driverAPath: M 5 35 L 20 35 C 40 35, 50 15, 75 15 L 95 15
  driverBPath: M 5 35 L 30 35 C 50 35, 60 10, 80 10 L 95 10
  metrics:
    - label: Braking Point
      value: A: 110m / B: 95m
      valueClass: text-neutral-900
    - label: Minimum Speed
      value: A: 82km/h / B: 74km/h
      valueClass: text-telemetry-blue
---

To the naked eye, it appeared to be a classic out-braking maneuver.

This is the narrative standard for modern motorsport.

Look at the telemetry trace.
```

Notes:
- Each paragraph separated by blank line.
- Parser can convert markdown body into `content: string[]` or rich blocks.

## 4.2 Signals File (`content/signals/*.md`)

```md
---
sessionId: monza-p1-2026
signals:
  - id: 1
    lap: 24
    location: SECTOR 2
    priority: high
    title: Medium compound front-left graining exceeding predicted model by 14%.
    meaning: Current pace delta will drop by +0.8s per lap within next 3 laps.
    implication: Strategy window shifting.
    telemetryFields:
      - label: Tire Temp (FL)
        value: 115C
        color: text-f1-red
        percentage: 85
      - label: Wear Rate
        value: +14% vs Model
        color: text-f1-red
        percentage: 60
---
```

## 4.3 UI Config Files (`content/ui/*.md`)

`content/ui/magazine-page.md`

```md
---
key: magazine_page
heroTitleLines:
  - A race is not speed.
  - It is decisions unfolding over time.
heroDescription: Dissecting the strategy, the telemetry, and the human element.
liveSignalLabel: Live Signal
liveSignalTitle: Monza P1 Telemetry
liveStatusLabel: LIVE
trackMapImage: https://cdn.example.com/maps/monza-track.png
latestAnalysisHeading: Latest Analysis
liveStats:
  - label: P1 GAP TO P2
    value: +1.245s
    valueClass: text-telemetry-blue
    icon: trending-up
---
```

## 5. Parsing and Build Pipeline
Use a script (`scripts/build-content.mjs`) with:
- `gray-matter`: parse frontmatter.
- `glob` or `fast-glob`: find markdown files.
- `remark` (optional): convert markdown to HTML or AST.
- `zod`: validate parsed shape.

Pipeline steps:
1. Read all markdown files under `content/`.
2. Parse frontmatter + markdown body.
3. Validate with schemas.
4. Normalize output into app-ready JSON.
5. Write JSON into `public/data/*.json`.

## 6. Output JSON Contracts (Frontend Consumption)

### 6.1 `public/data/stories.json`

```json
[
  {
    "slug": "the-anatomy-of-an-undercut",
    "status": "published",
    "category": "Strategy",
    "title": "The Anatomy of an Undercut",
    "summary": "A granular breakdown...",
    "publishedAt": "2026-05-02T00:00:00.000Z",
    "readTimeMin": 6,
    "coverImage": {
      "url": "https://cdn.example.com/stories/undercut-cover.jpg",
      "alt": "Undercut strategy visual"
    },
    "content": ["Paragraph 1", "Paragraph 2"],
    "telemetry": {
      "enabled": true,
      "title": "Telemetry Delta / Turn 14 Approach"
    }
  }
]
```

### 6.2 `public/data/signals.json`

```json
[
  {
    "sessionId": "monza-p1-2026",
    "signals": [
      {
        "id": "1",
        "lap": 24,
        "location": "SECTOR 2",
        "priority": "high"
      }
    ]
  }
]
```

### 6.3 `public/data/ui-config.json`

```json
{
  "magazine_page": {
    "heroTitleLines": ["A race is not speed.", "It is decisions unfolding over time."],
    "liveSignalTitle": "Monza P1 Telemetry"
  }
}
```

## 7. Frontend Integration Plan

1. Keep existing TypeScript types in `src/types.ts`.
2. Add content service functions:
   - `getStories()` fetches `/data/stories.json`
   - `getStoryBySlug(slug)`
   - `getSignals()` fetches `/data/signals.json`
   - `getUiConfig(key)` fetches `/data/ui-config.json`
3. Replace imports from `src/constants.ts` page by page.
4. Keep `constants.ts` as fallback until migration completes.

## 8. Versioning and Editorial Workflow

- Editors add/update markdown in `content/`.
- PR review validates narrative and metadata.
- CI runs parser + schema validation.
- If validation fails, PR blocks.
- On merge, content JSON rebuilds and deploys.

Suggested CI checks:
- All required frontmatter fields present.
- `slug` uniqueness.
- Valid dates.
- URL format checks.
- Priority enum checks (`high | med | low`).

## 9. Validation Rules (Recommended)

For stories:
- `slug`: required, kebab-case, unique.
- `status`: one of `draft`, `published`, `archived`.
- `coverImage.url`: valid URL.
- `content`: not empty.

For signals:
- `priority`: one of `high`, `med`, `low`.
- `telemetryFields.percentage`: between 0 and 100.

For UI config:
- `key`: required and unique.
- `liveStats[].icon`: from allowed icon list.

## 10. Pros and Trade-offs

Pros:
- No database to maintain.
- Great for Git-based editorial workflow.
- Full content history in commits.
- Easy rollback with git revert.

Trade-offs:
- No real-time edits without redeploy.
- Harder for non-technical editors unless CMS layer added.
- Search/filter at scale is less flexible than DB-backed APIs.

## 11. When to Move from Markdown to DB
Migrate to DB when:
- You need drafts, scheduling, and multi-role publishing.
- Content updates become frequent and non-dev users edit content.
- You need advanced querying, personalization, or analytics.

Until then, markdown is a solid and low-maintenance source of truth for your current app.
