# Database Implementation Plan (MongoDB) for Apex Frontend

## 1. Goal
Move hardcoded content currently in `src/constants.ts` into MongoDB so stories, images, signals, and telemetry stats are fetched from an API.

## 2. Recommended Architecture
- Frontend (existing Vite app): fetches content from API.
- Backend API (Node.js/Express or Next.js API routes): reads and writes MongoDB.
- MongoDB Atlas: stores content documents.
- Image storage: Cloudinary or S3 (store URLs in MongoDB, not binary images).

## 3. Suggested Collections

### 3.1 stories
Use for current `ARTICLES` and story detail telemetry blocks.

```json
{
  "_id": "ObjectId",
  "slug": "the-anatomy-of-an-undercut",
  "status": "published",
  "category": "Strategy",
  "title": "The Anatomy of an Undercut",
  "summary": "A granular breakdown...",
  "publishedAt": "2026-05-02T00:00:00.000Z",
  "readTimeMin": 6,
  "coverImage": {
    "url": "https://cdn.example.com/stories/undercut-cover.jpg",
    "alt": "Undercut strategy visual",
    "width": 1600,
    "height": 900
  },
  "content": [
    {
      "type": "paragraph",
      "text": "To the naked eye, it appeared..."
    },
    {
      "type": "paragraph",
      "text": "This is the narrative standard..."
    }
  ],
  "detailTelemetry": {
    "enabled": true,
    "title": "Telemetry Delta / Turn 14 Approach",
    "drivers": {
      "aLabel": "DRIVER A",
      "bLabel": "DRIVER B"
    },
    "graph": {
      "driverAPath": "M 5 35 L 20 35 C 40 35, 50 15, 75 15 L 95 15",
      "driverBPath": "M 5 35 L 30 35 C 50 35, 60 10, 80 10 L 95 10",
      "highlight": {
        "rect": { "x": 25, "y": 0, "width": 20, "height": 40, "fill": "#E10600", "opacity": 0.05 },
        "line": { "x1": 35, "y1": 0, "x2": 35, "y2": 40, "stroke": "#E10600", "strokeWidth": 0.2, "dashArray": "1,1" }
      },
      "labels": {
        "earlyLift": "EARLY LIFT (-15M)",
        "throttle": "THROTTLE APP. (+0.2S)"
      }
    },
    "metrics": [
      { "label": "Braking Point", "value": "A: 110m / B: 95m" },
      { "label": "Minimum Speed", "value": "A: 82km/h / B: 74km/h" }
    ]
  },
  "seo": {
    "metaTitle": "The Anatomy of an Undercut",
    "metaDescription": "Deep race strategy analysis..."
  },
  "createdAt": "2026-05-05T00:00:00.000Z",
  "updatedAt": "2026-05-05T00:00:00.000Z"
}
```

Indexes:
- `slug` unique
- `status`
- `category`
- `publishedAt` descending
- text index on `title`, `summary`, `content.text`

### 3.2 signals
Use for current `SIGNALS`.

```json
{
  "_id": "ObjectId",
  "lap": 24,
  "location": "SECTOR 2",
  "priority": "high",
  "title": "Medium compound front-left graining...",
  "meaning": "Current pace delta will drop...",
  "implication": "Strategy window shifting...",
  "telemetryFields": [
    { "label": "Tire Temp (FL)", "value": "115°C", "colorToken": "f1-red", "percentage": 85 },
    { "label": "Wear Rate", "value": "+14% vs Model", "colorToken": "f1-red", "percentage": 60 }
  ],
  "isActive": true,
  "sessionId": "monza-p1-2026",
  "createdAt": "2026-05-05T00:00:00.000Z",
  "updatedAt": "2026-05-05T00:00:00.000Z"
}
```

Indexes:
- `sessionId`
- `isActive`
- `priority`
- `lap` descending

### 3.3 ui_configs
Use for non-story shared UI config currently in `MAGAZINE_CONTENT`.

```json
{
  "_id": "ObjectId",
  "key": "magazine_page",
  "value": {
    "heroTitleLines": ["A race is not speed.", "It is decisions unfolding over time."],
    "heroDescription": "Dissecting the strategy...",
    "liveSignalLabel": "Live Signal",
    "liveSignalTitle": "Monza P1 Telemetry",
    "liveStatusLabel": "LIVE",
    "trackMapImage": {
      "url": "https://cdn.example.com/maps/monza-track.png",
      "alt": "Monza track map"
    },
    "latestAnalysisHeading": "Latest Analysis",
    "liveStats": [
      { "label": "P1 GAP TO P2", "value": "+1.245s", "icon": "trending-up", "colorToken": "telemetry-blue" },
      { "label": "SECTOR 1 FASTEST", "value": "26.431", "icon": "gauge", "colorToken": "gain-green" }
    ]
  },
  "updatedAt": "2026-05-05T00:00:00.000Z"
}
```

Indexes:
- `key` unique

### 3.4 media_assets (optional)
Track all images centrally.

```json
{
  "_id": "ObjectId",
  "provider": "cloudinary",
  "publicId": "stories/undercut-cover",
  "url": "https://cdn.example.com/stories/undercut-cover.jpg",
  "mimeType": "image/jpeg",
  "width": 1600,
  "height": 900,
  "alt": "Undercut strategy visual",
  "tags": ["story", "strategy", "cover"],
  "createdAt": "2026-05-05T00:00:00.000Z"
}
```

Indexes:
- `publicId` unique
- `tags`

## 4. API Endpoints (Suggested)
- `GET /api/stories?status=published&page=1&limit=10`
- `GET /api/stories/:slug`
- `POST /api/stories` (admin)
- `PATCH /api/stories/:id` (admin)
- `GET /api/signals?sessionId=monza-p1-2026`
- `GET /api/ui-configs/:key`

## 5. Migration Plan from constants.ts
1. Export current data from `src/constants.ts` into seed JSON files.
2. Build backend seed script to insert into `stories`, `signals`, and `ui_configs`.
3. Add API client layer in frontend:
   - `getStories()`
   - `getStoryBySlug()`
   - `getSignals()`
   - `getMagazineConfig()`
4. Replace direct imports from constants with API calls in pages.
5. Keep constants as local fallback during transition, then remove.

## 6. DB vs Markdown for New Stories
Use MongoDB if:
- You want runtime publishing without redeploy.
- Multiple editors need access.
- You need drafts, scheduling, filtering, or search.

Use Markdown if:
- One developer updates infrequently.
- Git-based content workflow is enough.

Best practical option:
- Hybrid workflow:
  - Author in Markdown.
  - Admin pipeline parses and publishes to MongoDB.
  - App reads from MongoDB.

## 7. Validation Rules
For `stories`:
- `slug`: required, unique, lowercase kebab-case.
- `title`: required, max length (for UI).
- `coverImage.url`: required, valid URL.
- `content`: non-empty array.
- `status`: enum `draft | published | archived`.
- `publishedAt`: required when status is `published`.

For `signals`:
- `priority`: enum `high | med | low`.
- `telemetryFields.percentage`: min 0, max 100.

## 8. Security and Ops Checklist
- Store Mongo connection string in environment variables.
- Use schema validation at API layer (`zod` or `joi`).
- Add role-based auth for write APIs.
- Add rate limits on public read endpoints.
- Cache list endpoints (short TTL).
- Keep audit fields (`createdAt`, `updatedAt`, `updatedBy`).
