# Apex Intelligence Platform — Full Implementation Plan

> **Date:** May 2026  
> **Scope:** Backend (auth + APIs), MongoDB, OpenF1 data ingestion, AI pipeline (CrewAI + LangGraph), centralized graph framework, frontend integration.  
> **Data source:** [OpenF1 API](https://openf1.org) — free, no API key, 18 endpoints, 3.7 Hz telemetry sampling, data from 2023 onwards.

---

## Table of Contents

1. [Final Architecture Overview](#1-final-architecture-overview)
2. [Monorepo Restructure](#2-monorepo-restructure)
3. [Phase 1 — Backend API (Node/Express/TypeScript)](#3-phase-1--backend-api)
4. [Phase 2 — MongoDB Schemas & Migrations](#4-phase-2--mongodb-schemas--migrations)
5. [Phase 3 — OpenF1 Data Ingestion Service](#5-phase-3--openf1-data-ingestion-service)
6. [Phase 4 — AI Pipeline (Python + CrewAI + LangGraph)](#6-phase-4--ai-pipeline)
7. [Phase 5 — Centralized Graph Framework (Frontend)](#7-phase-5--centralized-graph-framework)
8. [Phase 6 — Frontend API Integration](#8-phase-6--frontend-api-integration)
9. [Phase 7 — End-to-End Wiring & DevOps](#9-phase-7--end-to-end-wiring--devops)
10. [Environment Variables Reference](#10-environment-variables-reference)
11. [API Contract Reference](#11-api-contract-reference)

---

## 1. Final Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           APEX PLATFORM                                 │
│                                                                         │
│  ┌──────────────┐     ┌───────────────────┐     ┌───────────────────┐  │
│  │   Frontend   │────▶│   Backend API     │────▶│     MongoDB       │  │
│  │ React/Vite   │◀────│ Node/Express/TS   │◀────│     Atlas         │  │
│  │  port 3000   │     │    port 4000      │     │  (7 collections)  │  │
│  └──────────────┘     └─────────┬─────────┘     └───────────────────┘  │
│                                 │                                       │
│                         ┌───────▼────────┐                             │
│                         │  AI Worker     │                             │
│                         │ Python/FastAPI │                             │
│                         │   port 8000   │                             │
│                         └───────┬────────┘                             │
│                        ┌────────┴────────┐                             │
│                        │                 │                             │
│               ┌────────▼──────┐ ┌────────▼──────┐                     │
│               │  CrewAI       │ │  LangGraph    │                     │
│               │  Story Gen    │ │  Telemetry    │                     │
│               │  Pipeline     │ │  Analysis     │                     │
│               └───────────────┘ └───────────────┘                     │
│                                 │                                       │
│                         ┌───────▼────────┐                             │
│                         │   OpenF1 API   │                             │
│                         │ api.openf1.org │                             │
│                         │  18 endpoints  │                             │
│                         └───────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

**Service responsibilities:**

| Service | Language | Port | Responsibility |
|---------|----------|------|----------------|
| Frontend | TypeScript/React | 3000 | UI, graph rendering, story display |
| Backend API | TypeScript/Express | 4000 | Auth, REST endpoints, job dispatch |
| AI Worker | Python/FastAPI | 8000 | CrewAI story gen, LangGraph telemetry analysis |
| MongoDB | — | 27017 | Persistent storage for all entities |
| OpenF1 | External | — | Race weekend source-of-truth data |

---

## 2. Monorepo Restructure

Reorganize the repository from `Frontend/` only to a clean monorepo. **Do not delete the existing Frontend folder** — move it.

### 2.1 Target directory tree

```
apex/
├── Frontend/                    ← existing Vite app (unchanged for now)
│   └── src/...
│
├── Backend/                     ← NEW: Node/Express API
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.ts
│   │   │   └── env.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── error.middleware.ts
│   │   │   ├── rateLimit.middleware.ts
│   │   │   └── validate.middleware.ts
│   │   ├── models/
│   │   │   ├── User.model.ts
│   │   │   ├── Story.model.ts
│   │   │   ├── Signal.model.ts
│   │   │   ├── TelemetrySession.model.ts
│   │   │   ├── GraphSpec.model.ts
│   │   │   ├── StoryRun.model.ts
│   │   │   └── AuditLog.model.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── stories.routes.ts
│   │   │   ├── signals.routes.ts
│   │   │   ├── telemetry.routes.ts
│   │   │   ├── graphs.routes.ts
│   │   │   └── admin.routes.ts
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── stories.controller.ts
│   │   │   ├── signals.controller.ts
│   │   │   ├── telemetry.controller.ts
│   │   │   └── graphs.controller.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── token.service.ts
│   │   │   ├── openf1.service.ts
│   │   │   ├── aiWorker.service.ts
│   │   │   └── cache.service.ts
│   │   ├── schemas/
│   │   │   └── zod/                ← Zod validation schemas
│   │   ├── utils/
│   │   │   ├── logger.ts
│   │   │   └── asyncHandler.ts
│   │   └── index.ts                ← Express server entry
│   ├── package.json
│   ├── tsconfig.json
│   └── .env
│
├── AI/                          ← NEW: Python AI worker
│   ├── app/
│   │   ├── main.py              ← FastAPI entry
│   │   ├── config.py
│   │   ├── models/
│   │   │   ├── story_request.py
│   │   │   └── analysis_request.py
│   │   ├── pipelines/
│   │   │   ├── story_crew.py        ← CrewAI pipeline
│   │   │   └── telemetry_graph.py   ← LangGraph pipeline
│   │   ├── agents/
│   │   │   ├── telemetry_analyst.py
│   │   │   ├── signal_detector.py
│   │   │   ├── story_writer.py
│   │   │   ├── chart_designer.py
│   │   │   └── projection_builder.py
│   │   ├── tools/
│   │   │   ├── openf1_tool.py
│   │   │   ├── mongo_tool.py
│   │   │   └── stats_tool.py
│   │   └── utils/
│   │       ├── telemetry_math.py
│   │       └── db_client.py
│   ├── requirements.txt
│   └── .env
│
├── docker-compose.yml           ← Optional: orchestrate all services
├── IMPLEMENTATION_PLAN.md       ← This file
└── README.md
```

### 2.2 Steps

1. Create `Backend/` and `AI/` directories at the repo root.
2. Initialize `Backend/` as a new Node project: `npm init -y` inside `Backend/`.
3. Initialize `AI/` as a Python project with `venv` and `requirements.txt`.
4. Add a root `docker-compose.yml` to run all three services together.

---

## 3. Phase 1 — Backend API

### 3.1 Install Backend dependencies

```bash
cd Backend

# Runtime
npm install express mongoose zod bcryptjs jsonwebtoken cookie-parser \
  cors dotenv helmet morgan axios express-rate-limit uuid

# Dev
npm install -D typescript ts-node-dev @types/express @types/mongoose \
  @types/bcryptjs @types/jsonwebtoken @types/cookie-parser @types/cors \
  @types/morgan @types/uuid eslint prettier
```

**`Backend/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  }
}
```

### 3.2 Server entry point

**`Backend/src/index.ts`**
```typescript
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { connectDB } from './config/db';
import { env } from './config/env';
import { errorMiddleware } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import storiesRoutes from './routes/stories.routes';
import signalsRoutes from './routes/signals.routes';
import telemetryRoutes from './routes/telemetry.routes';
import graphsRoutes from './routes/graphs.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.use('/api/auth', authRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/signals', signalsRoutes);
app.use('/api/telemetry', telemetryRoutes);
app.use('/api/graphs', graphsRoutes);

app.use(errorMiddleware);

connectDB().then(() => {
  app.listen(env.PORT, () =>
    console.log(`Backend running on port ${env.PORT}`)
  );
});
```

### 3.3 Auth design

**Approach:** JWT access tokens (15-min TTL) + httpOnly refresh tokens (7-day TTL) stored in cookies.  
**Roles:** `viewer` (default), `editor`, `admin`.

**`Backend/src/routes/auth.routes.ts`** exposes:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account with email + password |
| POST | `/api/auth/login` | Returns access JWT; sets refresh cookie |
| POST | `/api/auth/refresh` | Exchange refresh cookie for new access token |
| POST | `/api/auth/logout` | Clear refresh cookie |
| GET | `/api/auth/me` | Return current user profile |
| PATCH | `/api/auth/me` | Update display name / avatar |
| POST | `/api/auth/forgot-password` | Send reset email (nodemailer) |
| POST | `/api/auth/reset-password` | Consume reset token, set new password |

**Auth middleware** (`auth.middleware.ts`):
- Extract `Bearer` token from `Authorization` header.
- Verify with `jsonwebtoken.verify()` against `JWT_SECRET`.
- Attach decoded payload to `req.user`.
- Separate `requireRole('admin')` guard for admin routes.

**Security checklist:**
- Passwords hashed with `bcryptjs` (cost factor 12).
- Refresh tokens hashed (SHA-256) before storage.
- One refresh token family per device; rotate on every use.
- Rate-limit `/api/auth/login` to 10 requests/min per IP using `express-rate-limit`.
- All user inputs validated through Zod schemas before hitting the DB.

### 3.4 Stories API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/stories` | public | Paginated list; filter by category, status, date |
| GET | `/api/stories/:slug` | public | Single story with full content + graph specs |
| POST | `/api/stories` | editor | Create story (or trigger AI generation) |
| PATCH | `/api/stories/:id` | editor | Update title, content, status |
| DELETE | `/api/stories/:id` | admin | Soft-delete (set `status: archived`) |
| POST | `/api/stories/:id/generate` | editor | Dispatch AI story generation job |
| GET | `/api/stories/:id/run-status` | editor | Poll CrewAI job status |

### 3.5 Telemetry & OpenF1 proxy routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/telemetry/sessions` | List available race sessions (cached) |
| GET | `/api/telemetry/sessions/:key` | Session metadata |
| GET | `/api/telemetry/sessions/:key/drivers` | Drivers in a session |
| GET | `/api/telemetry/sessions/:key/laps` | Lap times; filter `?driver=16` |
| GET | `/api/telemetry/sessions/:key/car` | Car telemetry; filter `?driver=16&lap=42` |
| GET | `/api/telemetry/sessions/:key/stints` | Tire stints + compound |
| GET | `/api/telemetry/sessions/:key/pit` | Pit stop data |
| GET | `/api/telemetry/sessions/:key/signals` | Computed signals for this session |
| GET | `/api/telemetry/sessions/:key/graphs` | All graph specs attached to this session |
| POST | `/api/telemetry/sessions/:key/ingest` | Trigger OpenF1 ingestion for a session |

### 3.6 Graphs API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/graphs/:id` | Fetch a graph spec by ID |
| GET | `/api/graphs?storyId=...` | All graphs for a story |
| POST | `/api/graphs` | Create a graph spec (editor) |
| PATCH | `/api/graphs/:id` | Update spec |
| DELETE | `/api/graphs/:id` | Remove graph |

---

## 4. Phase 2 — MongoDB Schemas & Migrations

### 4.1 Collection overview

| Collection | Primary purpose |
|------------|----------------|
| `users` | Auth identities, roles |
| `stories` | Articles + AI-generated narrative content |
| `signals` | Telemetry anomaly alerts tied to sessions |
| `telemetry_sessions` | Cached OpenF1 session data |
| `graph_specs` | Declarative chart descriptors linked to stories/sessions |
| `story_runs` | AI generation job logs (CrewAI) |
| `audit_logs` | Write-operation audit trail |

### 4.2 `users` schema

```typescript
// Backend/src/models/User.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  displayName: string;
  role: 'viewer' | 'editor' | 'admin';
  avatar?: string;
  refreshTokenHash?: string;       // hashed refresh token for current session
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  email:               { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash:        { type: String, required: true },
  displayName:         { type: String, required: true, maxlength: 80 },
  role:                { type: String, enum: ['viewer', 'editor', 'admin'], default: 'viewer' },
  avatar:              { type: String },
  refreshTokenHash:    { type: String },
  passwordResetToken:  { type: String },
  passwordResetExpires:{ type: Date },
}, { timestamps: true });

UserSchema.index({ email: 1 });
export const User = mongoose.model<IUser>('User', UserSchema);
```

### 4.3 `stories` schema

```typescript
// Backend/src/models/Story.model.ts
const ContentBlockSchema = new Schema({
  type: { type: String, enum: ['paragraph', 'heading', 'quote', 'stat', 'graph_embed'], required: true },
  text:    { type: String },
  graphId: { type: Schema.Types.ObjectId, ref: 'GraphSpec' }, // only for graph_embed blocks
  meta:    { type: Schema.Types.Mixed },  // any extra props
}, { _id: false });

const StorySchema = new Schema({
  slug:         { type: String, required: true, unique: true },
  status:       { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  category:     { type: String, required: true },
  title:        { type: String, required: true, maxlength: 200 },
  summary:      { type: String, maxlength: 500 },
  coverImage:   {
    url: { type: String, required: true },
    alt: { type: String, required: true },
  },
  content:      [ContentBlockSchema],      // ordered blocks; graph_embed blocks reference GraphSpec
  readTimeMin:  { type: Number },
  tags:         [String],
  sessionKey:   { type: String },          // OpenF1 session_key this story is about
  publishedAt:  { type: Date },
  aiGenerated:  { type: Boolean, default: false },
  authorId:     { type: Schema.Types.ObjectId, ref: 'User' },
  seo: {
    metaTitle:       String,
    metaDescription: String,
  },
}, { timestamps: true });

StorySchema.index({ slug: 1 }, { unique: true });
StorySchema.index({ status: 1, publishedAt: -1 });
StorySchema.index({ category: 1 });
StorySchema.index({ sessionKey: 1 });
StorySchema.index({ title: 'text', summary: 'text' });
```

### 4.4 `telemetry_sessions` schema

```typescript
// Backend/src/models/TelemetrySession.model.ts
// Caches OpenF1 data locally to avoid repeated API calls.
const TelemetrySessionSchema = new Schema({
  sessionKey:       { type: String, required: true, unique: true },  // OpenF1 session_key
  sessionName:      { type: String },   // e.g. "Race", "Qualifying"
  circuitName:      { type: String },
  country:          { type: String },
  year:             { type: Number },
  meetingKey:       { type: String },   // OpenF1 meeting_key
  dateStart:        { type: Date },
  dateEnd:          { type: Date },
  ingestedAt:       { type: Date },     // when we last pulled from OpenF1
  drivers: [{
    driverNumber:   Number,
    fullName:       String,
    abbreviation:   String,
    teamName:       String,
    teamColour:     String,
  }],
  // Aggregated/preprocessed telemetry stored here after AI analysis
  processedLaps: [{
    driverNumber:   Number,
    lap:            Number,
    lapTime:        Number,
    sectors:        [Number],
    compound:       String,
    stintLap:       Number,
    events:         [String],    // ['lockup', 'personal_best', 'safety_car', ...]
  }],
  rawDataRef: {
    // S3/GridFS path or inline for small sessions
    lapsPath:       String,
    carDataPath:    String,
  },
}, { timestamps: true });
```

### 4.5 `graph_specs` schema

This is the most important schema — it drives ALL chart rendering in the frontend.

```typescript
// Backend/src/models/GraphSpec.model.ts
const GraphSpecSchema = new Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'line',            // time-series or lap-series line chart
      'multi_line',      // multiple drivers on same axis
      'comparison',      // driver A vs driver B traces
      'bar',             // lap times, stint lengths
      'bar_grouped',     // side-by-side bars per driver
      'sparkline',       // small inline trend
      'scatter',         // correlation plots
      'area',            // cumulative / stacked area
      'projection',      // historical + forecasted trend with confidence band
      'tire_map',        // stint timeline showing compound changes
      'heat_map',        // track sector heat map
      'annotated_svg',   // arbitrary SVG path + overlay annotations
    ],
  },
  title:        { type: String },
  subtitle:     { type: String },
  storyId:      { type: Schema.Types.ObjectId, ref: 'Story' },
  sessionKey:   { type: String },

  // --- Axis & Data Config ---
  xAxis: {
    key:    String,    // data field name, e.g. "lap", "time", "distance"
    label:  String,
    unit:   String,    // "lap", "s", "m", "km/h", "%"
  },
  yAxis: {
    key:    String,
    label:  String,
    unit:   String,
    domain: [Number],  // [min, max] override
  },

  // --- Series ---
  series: [{
    id:           String,
    label:        String,
    driverNumber: Number,
    color:        String,   // hex or Tailwind token
    dataKey:      String,   // field name in dataPoints
    strokeDash:   String,   // e.g. "4 2" for dashed
    type:         { type: String, enum: ['actual', 'projected', 'reference'] },
  }],

  // --- Inline data (for small/static charts) ---
  dataPoints: [Schema.Types.Mixed],   // array of {lap: 1, speedA: 312, speedB: 307, ...}

  // --- For projection charts ---
  projectionConfig: {
    method:           { type: String, enum: ['linear', 'polynomial', 'exponential'] },
    historicalLaps:   Number,     // how many past laps drive the projection
    forecastLaps:     Number,
    confidenceBand:   Boolean,
  },

  // --- Annotations ---
  annotations: [{
    type:     { type: String, enum: ['point', 'band', 'line', 'label'] },
    xValue:   Schema.Types.Mixed,     // lap number or timestamp
    xRange:   [Schema.Types.Mixed],   // [start, end] for band
    color:    String,
    label:    String,
    meta:     Schema.Types.Mixed,
  }],

  // --- SVG paths (for annotated_svg type) ---
  svgPaths: [{
    d:          String,
    stroke:     String,
    strokeWidth:Number,
    fill:       String,
  }],

  // --- Metadata ---
  generatedByAI:  { type: Boolean, default: false },
  aiRunId:        { type: Schema.Types.ObjectId, ref: 'StoryRun' },
}, { timestamps: true });

GraphSpecSchema.index({ storyId: 1 });
GraphSpecSchema.index({ sessionKey: 1 });
```

### 4.6 `story_runs` schema (AI job tracking)

```typescript
const StoryRunSchema = new Schema({
  storyId:      { type: Schema.Types.ObjectId, ref: 'Story' },
  sessionKey:   { type: String },
  status:       { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
  pipeline:     { type: String, enum: ['crew_story', 'langraph_telemetry', 'full'] },
  triggeredBy:  { type: Schema.Types.ObjectId, ref: 'User' },
  startedAt:    { type: Date },
  completedAt:  { type: Date },
  logs:         [String],
  error:        { type: String },
  outputRef: {
    storyId:    Schema.Types.ObjectId,
    graphIds:   [Schema.Types.ObjectId],
    signalIds:  [Schema.Types.ObjectId],
  },
}, { timestamps: true });
```

### 4.7 Seed script for existing mock data

Create `Backend/src/scripts/seed.ts`:

1. Read the four articles from `Frontend/src/constants.ts` (copy as JSON).
2. For each article, build a Story document with `status: 'published'`, a slug derived from the title, and content blocks of type `paragraph`.
3. For the first article ("Anatomy of an Undercut"), also seed one `graph_spec` of type `annotated_svg` using the existing SVG path data.
4. Read the three SIGNALS and seed them into the `signals` collection.
5. Seed one admin user (`admin@apex.local` / `ChangeMe!`).

Run with: `npx ts-node src/scripts/seed.ts`

---

## 5. Phase 3 — OpenF1 Data Ingestion Service

### 5.1 OpenF1 API endpoints used

| OpenF1 endpoint | Method | Used for |
|-----------------|--------|----------|
| `/v1/meetings` | GET | List all race weekends |
| `/v1/sessions?meeting_key=...` | GET | Sessions (FP1, Qual, Race) per weekend |
| `/v1/drivers?session_key=...` | GET | Driver roster per session |
| `/v1/laps?session_key=...&driver_number=...` | GET | Lap times + sector splits |
| `/v1/car_data?session_key=...&driver_number=...` | GET | 3.7 Hz telemetry: speed, throttle, brake, RPM, gear |
| `/v1/stints?session_key=...` | GET | Tire compound changes |
| `/v1/pit?session_key=...` | GET | Pit stop timing |
| `/v1/race_control?session_key=...` | GET | Safety car, flags, incidents |
| `/v1/weather?session_key=...` | GET | Track/air temp, wind, rain |
| `/v1/intervals?session_key=...` | GET | Gaps to leader |
| `/v1/position?session_key=...` | GET | Race position timeline |

### 5.2 OpenF1 service (Backend)

**`Backend/src/services/openf1.service.ts`**
```typescript
import axios from 'axios';

const BASE = 'https://api.openf1.org/v1';
const RATE_LIMIT_DELAY_MS = 400; // stay under 3 req/s free tier

async function get<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await axios.get<T>(`${BASE}${endpoint}`, { params });
  await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
  return res.data;
}

export const openf1 = {
  getMeetings:    (year: number) => get('/meetings', { year }),
  getSessions:    (meetingKey: string) => get('/sessions', { meeting_key: meetingKey }),
  getDrivers:     (sessionKey: string) => get('/drivers', { session_key: sessionKey }),
  getLaps:        (sessionKey: string, driverNumber?: number) =>
                    get('/laps', { session_key: sessionKey, driver_number: driverNumber }),
  getCarData:     (sessionKey: string, driverNumber: number) =>
                    get('/car_data', { session_key: sessionKey, driver_number: driverNumber }),
  getStints:      (sessionKey: string) => get('/stints', { session_key: sessionKey }),
  getPit:         (sessionKey: string) => get('/pit', { session_key: sessionKey }),
  getRaceControl: (sessionKey: string) => get('/race_control', { session_key: sessionKey }),
  getWeather:     (sessionKey: string) => get('/weather', { session_key: sessionKey }),
  getIntervals:   (sessionKey: string) => get('/intervals', { session_key: sessionKey }),
  getPosition:    (sessionKey: string) => get('/position', { session_key: sessionKey }),
};
```

### 5.3 Ingestion controller flow

`POST /api/telemetry/sessions/:key/ingest` triggers the following:

```
1. Check if TelemetrySession with sessionKey already exists (skip if ingestedAt < 1 hour ago).
2. Call openf1.getDrivers(sessionKey).
3. Call openf1.getLaps(sessionKey) for all drivers.
4. Call openf1.getStints(sessionKey).
5. Call openf1.getPit(sessionKey).
6. Call openf1.getRaceControl(sessionKey).
7. Call openf1.getWeather(sessionKey).
8. Normalize and merge all data into processedLaps array.
9. Tag each lap with events: ['lockup', 'personal_best', 'pit_in', 'sc_deployed', ...].
10. Upsert TelemetrySession document.
11. Dispatch AI worker job (POST to Python FastAPI /run/telemetry-analysis).
12. Return { sessionKey, status: 'ingested', storyRunId }.
```

**Car data note:** Car telemetry at 3.7 Hz is very large (~10,000 rows per driver per lap). Fetch it lazily only when a specific driver + lap is requested (e.g., for driver comparison graphs), not during bulk ingestion.

### 5.4 Caching strategy

- `GET /api/telemetry/sessions` caches the meetings list for 1 hour using an in-memory `Map` (or Redis if deployed).
- Individual session telemetry is persisted in MongoDB after first ingestion.
- Car-data blobs can be stored in MongoDB as embedded arrays for sessions under 50 laps, or as S3/GridFS references for full race weekends.

---

## 6. Phase 4 — AI Pipeline

### 6.1 Architecture decision

Two separate pipelines, both in Python:

| Pipeline | Framework | Input | Output |
|----------|-----------|-------|--------|
| **Telemetry Analysis** | **LangGraph** | Raw lap data, stints, race control | Signals, detected events, projection data, graph specs |
| **Story Generation** | **CrewAI** | Telemetry analysis results + session context | Story content blocks, narrative text, embedded graph references |

**Why LangGraph for telemetry?** Telemetry analysis is a stateful graph of conditional steps: normalize → detect events → compute deltas → project trends → generate chart specs. Each step depends on the previous and may branch (e.g., skip projection if fewer than 10 laps). LangGraph's explicit state machine is the right tool.

**Why CrewAI for stories?** Story generation benefits from specialized agents with roles (analyst, writer, fact-checker, chart curator) collaborating as a crew. CrewAI's role-based delegation model maps naturally here.

### 6.2 Python dependencies

**`AI/requirements.txt`**
```
fastapi==0.111.0
uvicorn[standard]==0.29.0
crewai==0.80.0
crewai-tools==0.12.0
langgraph==0.2.0
langchain-openai==0.1.7
langchain-google-genai==1.0.5
pymongo==4.7.2
httpx==0.27.0
python-dotenv==1.0.1
numpy==1.26.4
scipy==1.13.0
pandas==2.2.2
pydantic==2.7.1
```

**`AI/app/config.py`**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    MONGODB_URI: str
    BACKEND_API_URL: str = "http://localhost:4000"
    LLM_PROVIDER: str = "gemini"   # "openai" | "gemini"
    LLM_MODEL: str = "gemini-2.0-flash"
    model_config = {"env_file": ".env"}

settings = Settings()
```

### 6.3 LangGraph — Telemetry Analysis Pipeline

**`AI/app/pipelines/telemetry_graph.py`**

The graph has 7 nodes that form this DAG:

```
load_session
     │
     ▼
normalize_laps
     │
     ▼
detect_events          ← flags lockups, personal bests, SC periods
     │
     ▼
compute_deltas         ← lap-by-lap delta vs rolling average, cross-driver diffs
     │
     ▼
detect_signals         ← anomaly thresholds: tire deg >12%, braking variance >15%
     │
     ▼
build_projections      ← polynomial fit for remaining laps, tire deg forecast
     │
     ▼
generate_graph_specs   ← outputs GraphSpec JSON documents for each chart
     │
     ▼
persist_results        ← writes Signals + GraphSpecs to MongoDB via Backend API
```

**State object:**
```python
from typing import TypedDict, Optional
import pandas as pd

class TelemetryState(TypedDict):
    session_key: str
    session_data: dict                  # raw from MongoDB
    laps_df: Optional[pd.DataFrame]    # normalized lap data
    events: list[dict]                 # detected events per lap/driver
    deltas: dict                       # {driver: {lap: delta}}
    signals: list[dict]                # anomaly signals
    projections: dict                  # {driver: {lap: projected_laptime}}
    graph_specs: list[dict]            # list of GraphSpec-compatible dicts
    errors: list[str]
```

**Node implementation sketch:**
```python
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
import pandas as pd, numpy as np

llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash")

def normalize_laps(state: TelemetryState) -> TelemetryState:
    laps = state["session_data"]["processedLaps"]
    df = pd.DataFrame(laps)
    # convert lap time strings "1:21.432" → seconds 81.432
    df["lapTimeSec"] = df["lapTime"].apply(parse_lap_time)
    # flag outlier laps (in-laps, out-laps) as non-representative
    df["isRepresentative"] = (~df["events"].apply(
        lambda e: any(x in e for x in ["pit_in", "pit_out", "safety_car"])
    ))
    state["laps_df"] = df
    return state

def detect_signals(state: TelemetryState) -> TelemetryState:
    df = state["laps_df"]
    signals = []
    for driver in df["driverNumber"].unique():
        d = df[(df["driverNumber"] == driver) & df["isRepresentative"]]
        if len(d) < 3:
            continue
        rolling_mean = d["lapTimeSec"].rolling(3, center=True).mean()
        delta = d["lapTimeSec"] - rolling_mean
        # Signal: lap time spike > 0.8s above 3-lap rolling mean
        spikes = d[delta > 0.8]
        for _, row in spikes.iterrows():
            signals.append({
                "driverNumber": driver,
                "lap": int(row["lap"]),
                "type": "lap_time_spike",
                "value": round(float(delta[row.name]), 3),
                "priority": "high" if float(delta[row.name]) > 1.5 else "med",
                "title": f"Lap time spike +{delta[row.name]:.2f}s above rolling avg",
            })
    state["signals"] = signals
    return state

def build_projections(state: TelemetryState) -> TelemetryState:
    df = state["laps_df"]
    projections = {}
    for driver in df["driverNumber"].unique():
        d = df[(df["driverNumber"] == driver) & df["isRepresentative"]]
        if len(d) < 5:
            continue
        laps = d["lap"].values
        times = d["lapTimeSec"].values
        # Polynomial degree-2 fit (captures tire degradation curve)
        coeffs = np.polyfit(laps, times, 2)
        max_lap = laps.max()
        future_laps = np.arange(max_lap + 1, max_lap + 11)
        projected = np.polyval(coeffs, future_laps)
        # Residual std for confidence band
        residuals = times - np.polyval(coeffs, laps)
        std = float(np.std(residuals))
        projections[str(driver)] = {
            "historicalLaps": laps.tolist(),
            "historicalTimes": times.tolist(),
            "projectedLaps": future_laps.tolist(),
            "projectedTimes": projected.tolist(),
            "confidenceBand": std,
        }
    state["projections"] = projections
    return state

def generate_graph_specs(state: TelemetryState) -> TelemetryState:
    # Build graph spec dicts matching the GraphSpec MongoDB schema
    specs = []
    projections = state["projections"]

    for driver_str, proj in projections.items():
        spec = {
            "type": "projection",
            "title": f"Driver #{driver_str} — Lap Time Projection",
            "sessionKey": state["session_key"],
            "xAxis": {"key": "lap", "label": "Lap", "unit": "lap"},
            "yAxis": {"key": "lapTime", "label": "Lap Time", "unit": "s"},
            "series": [
                {"id": "actual", "label": "Actual", "driverNumber": int(driver_str),
                 "color": "#171717", "dataKey": "actual", "type": "actual"},
                {"id": "projected", "label": "Projected", "driverNumber": int(driver_str),
                 "color": "#E10600", "dataKey": "projected", "type": "projected",
                 "strokeDash": "4 2"},
            ],
            "dataPoints": [
                *[{"lap": l, "actual": t} for l, t in zip(proj["historicalLaps"], proj["historicalTimes"])],
                *[{"lap": l, "projected": t} for l, t in zip(proj["projectedLaps"], proj["projectedTimes"])],
            ],
            "projectionConfig": {
                "method": "polynomial",
                "historicalLaps": len(proj["historicalLaps"]),
                "forecastLaps": 10,
                "confidenceBand": True,
            },
            "generatedByAI": True,
        }
        specs.append(spec)

    # Also generate a multi_line comparison chart for top drivers
    # (lap time comparison — all drivers on one chart)
    # ... (similar construction)

    state["graph_specs"] = specs
    return state

# Build and compile the graph
workflow = StateGraph(TelemetryState)
workflow.add_node("normalize_laps", normalize_laps)
workflow.add_node("detect_events", detect_events)
workflow.add_node("compute_deltas", compute_deltas)
workflow.add_node("detect_signals", detect_signals)
workflow.add_node("build_projections", build_projections)
workflow.add_node("generate_graph_specs", generate_graph_specs)
workflow.add_node("persist_results", persist_results)

workflow.set_entry_point("normalize_laps")
workflow.add_edge("normalize_laps", "detect_events")
workflow.add_edge("detect_events", "compute_deltas")
workflow.add_edge("compute_deltas", "detect_signals")
workflow.add_edge("detect_signals", "build_projections")
workflow.add_edge("build_projections", "generate_graph_specs")
workflow.add_edge("generate_graph_specs", "persist_results")
workflow.add_edge("persist_results", END)

telemetry_graph = workflow.compile()
```

### 6.4 CrewAI — Story Generation Pipeline

**`AI/app/pipelines/story_crew.py`**

Five agents, one crew:

```python
from crewai import Agent, Crew, Task, Process
from crewai_tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI

llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash", temperature=0.7)

# --- AGENTS ---

telemetry_analyst = Agent(
    role="F1 Telemetry Analyst",
    goal="Extract the most technically significant moments from race telemetry data.",
    backstory=(
        "You are a former Formula 1 data engineer with 15 years of experience "
        "at a top team. You can read raw lap data and identify micro-stories "
        "in the numbers — tire degradation rates, braking points, ERS deployment "
        "patterns. You communicate only in precise, technical terms."
    ),
    llm=llm,
    tools=[openf1_fetch_tool, mongo_read_tool],
    verbose=True,
)

signal_detector = Agent(
    role="Race Intelligence Analyst",
    goal="Identify and rank the strategically significant anomalies in the session.",
    backstory=(
        "You watch races with the mind of a strategist. You flag the moments "
        "that changed the race outcome — the tire compounds that underperformed, "
        "the pit windows that were too late, the safety car that reshuffled the grid. "
        "You produce ranked signal summaries with tactical implications."
    ),
    llm=llm,
    tools=[mongo_read_tool],
    verbose=True,
)

story_writer = Agent(
    role="Motorsport Journalist",
    goal="Transform technical analysis into a compelling, high-quality editorial story.",
    backstory=(
        "You write for a premium motorsport publication. Your stories are read by "
        "engineers and fans alike. You never use clichés. You start in the middle "
        "of the action, then zoom out. Every paragraph earns its place. "
        "You produce content at the level of The Race or Autosport long-form."
    ),
    llm=llm,
    verbose=True,
)

chart_curator = Agent(
    role="Data Visualization Curator",
    goal="Select and configure the graphs that best support the story's narrative.",
    backstory=(
        "You are a data journalist who believes every chart must earn its place. "
        "You choose from the available graph specs and embed only those that "
        "directly illustrate a claim in the story. You output structured JSON "
        "describing which graph goes where in the story, with captions."
    ),
    llm=llm,
    tools=[mongo_read_tool],
    verbose=True,
)

fact_checker = Agent(
    role="F1 Data Fact Checker",
    goal="Verify that all claims in the story are supported by the telemetry data.",
    backstory=(
        "You cross-reference every factual claim against the raw numbers. "
        "If a lap time is cited, you check it. If a delta is stated, you verify it. "
        "You flag any unsupported claims and suggest corrections."
    ),
    llm=llm,
    tools=[mongo_read_tool],
    verbose=True,
)

# --- TASKS ---

def build_story_crew(session_key: str, story_run_id: str) -> Crew:

    task_analyze = Task(
        description=f"""
        Analyze the telemetry session {session_key} from MongoDB.
        Identify:
        1. The top 3 most technically significant driver performances.
        2. Key tire degradation patterns and when they diverged from model.
        3. Any braking point or entry speed anomalies.
        4. ERS deployment patterns at critical overtaking zones.
        Output a structured technical brief.
        """,
        expected_output="A structured technical brief with driver names, lap numbers, and specific metrics.",
        agent=telemetry_analyst,
    )

    task_signals = Task(
        description=f"""
        Using the technical brief from the analyst:
        1. Identify and rank the top 5 strategic signals from session {session_key}.
        2. For each signal, provide: lap, location, priority (high/med/low),
           title (one sentence), meaning, implication.
        3. Identify which signal had the greatest race outcome impact.
        Output a JSON array of signal objects matching the Apex Signal schema.
        """,
        expected_output="JSON array of signal objects.",
        agent=signal_detector,
        context=[task_analyze],
    )

    task_write = Task(
        description=f"""
        Using the technical brief and signal list:
        Write a full editorial story for the Apex motorsport platform about session {session_key}.
        Requirements:
        - 600–900 words.
        - Four to six content blocks of type 'paragraph'.
        - Title: max 10 words, specific and technical.
        - Lead: start mid-action, not with background.
        - Every factual claim must cite the lap number and/or metric.
        - Tone: premium motorsport journalism — clinical but compelling.
        Output JSON matching the Apex Story content schema:
        {{ "title": "...", "summary": "...", "content": [{{"type": "paragraph", "text": "..."}}] }}
        """,
        expected_output="JSON object with title, summary, content array.",
        agent=story_writer,
        context=[task_analyze, task_signals],
    )

    task_charts = Task(
        description=f"""
        Given the story draft and the available graph_specs in MongoDB for session {session_key}:
        1. Select 2–4 graphs that directly illustrate specific claims in the story.
        2. For each selected graph, identify after which paragraph block it should be embedded.
        3. Write a one-sentence caption for each.
        Output a JSON list:
        [{{ "graphId": "...", "afterBlockIndex": 2, "caption": "..." }}]
        """,
        expected_output="JSON list of graph embedding instructions.",
        agent=chart_curator,
        context=[task_write],
    )

    task_verify = Task(
        description=f"""
        Review the story draft and verify:
        1. All lap times cited match actual data in MongoDB for session {session_key}.
        2. All driver names and numbers are correct.
        3. All deltas and percentages are accurate.
        If corrections are needed, output the corrected story JSON.
        If no corrections needed, output the original story JSON unchanged.
        """,
        expected_output="Final verified story JSON.",
        agent=fact_checker,
        context=[task_write, task_charts],
    )

    return Crew(
        agents=[telemetry_analyst, signal_detector, story_writer, chart_curator, fact_checker],
        tasks=[task_analyze, task_signals, task_write, task_charts, task_verify],
        process=Process.sequential,
        verbose=True,
    )
```

### 6.5 FastAPI entry point

**`AI/app/main.py`**
```python
from fastapi import FastAPI, BackgroundTasks, HTTPException
from .models.story_request import StoryRequest
from .models.analysis_request import AnalysisRequest
from .pipelines.telemetry_graph import telemetry_graph, TelemetryState
from .pipelines.story_crew import build_story_crew
from .utils.db_client import mongo_client
import asyncio

app = FastAPI(title="Apex AI Worker")

@app.post("/run/telemetry-analysis")
async def run_telemetry_analysis(req: AnalysisRequest, bg: BackgroundTasks):
    """Trigger LangGraph telemetry analysis pipeline for a session."""
    run_id = req.story_run_id

    async def run():
        # Update run status to 'running'
        await update_run_status(run_id, "running")
        try:
            initial_state: TelemetryState = {
                "session_key": req.session_key,
                "session_data": await load_session_from_mongo(req.session_key),
                "laps_df": None,
                "events": [],
                "deltas": {},
                "signals": [],
                "projections": {},
                "graph_specs": [],
                "errors": [],
            }
            result = await asyncio.to_thread(telemetry_graph.invoke, initial_state)
            await update_run_status(run_id, "done", output_ref=result.get("output_ref"))
        except Exception as e:
            await update_run_status(run_id, "failed", error=str(e))

    bg.add_task(run)
    return {"runId": run_id, "status": "queued"}

@app.post("/run/story-generation")
async def run_story_generation(req: StoryRequest, bg: BackgroundTasks):
    """Trigger CrewAI story generation pipeline."""
    run_id = req.story_run_id

    async def run():
        await update_run_status(run_id, "running")
        try:
            crew = build_story_crew(req.session_key, run_id)
            result = await asyncio.to_thread(crew.kickoff)
            # Parse crew output, build story + embed graph references
            await save_story_to_backend(result, req.session_key, run_id)
            await update_run_status(run_id, "done")
        except Exception as e:
            await update_run_status(run_id, "failed", error=str(e))

    bg.add_task(run)
    return {"runId": run_id, "status": "queued"}

@app.get("/run/{run_id}/status")
async def get_run_status(run_id: str):
    doc = await mongo_client.story_runs.find_one({"_id": run_id})
    if not doc:
        raise HTTPException(404, "Run not found")
    return {"runId": run_id, "status": doc["status"], "logs": doc.get("logs", [])}
```

### 6.6 CrewAI tool definitions

**`AI/app/tools/openf1_tool.py`**
```python
from crewai_tools import tool
import httpx

@tool("fetch_openf1_laps")
def fetch_laps(session_key: str, driver_number: int | None = None) -> str:
    """Fetch lap time data from OpenF1 API for a given session."""
    params = {"session_key": session_key}
    if driver_number:
        params["driver_number"] = driver_number
    r = httpx.get("https://api.openf1.org/v1/laps", params=params, timeout=30)
    return r.text  # returns JSON string which the LLM can read
```

**`AI/app/tools/mongo_tool.py`**
```python
from crewai_tools import tool
from ..utils.db_client import db

@tool("read_mongo_session")
def read_session(session_key: str) -> str:
    """Read processed telemetry session data from MongoDB."""
    doc = db.telemetry_sessions.find_one({"sessionKey": session_key})
    if not doc:
        return f"No session found for key {session_key}"
    doc.pop("_id", None)
    import json
    return json.dumps(doc, default=str)

@tool("read_mongo_graph_specs")
def read_graph_specs(session_key: str) -> str:
    """Read available graph specs for a session from MongoDB."""
    specs = list(db.graph_specs.find({"sessionKey": session_key}))
    for s in specs:
        s["id"] = str(s.pop("_id"))
    import json
    return json.dumps(specs, default=str)
```

---

## 7. Phase 5 — Centralized Graph Framework (Frontend)

### 7.1 Install charting dependencies

```bash
cd Frontend
npm install recharts @types/recharts date-fns
```

**Why Recharts:** It is a React-first library built on D3, already uses SVG like the current hand-rolled chart, supports all required chart types (Line, Bar, Area, Scatter, ComposedChart), and integrates cleanly with Tailwind.

### 7.2 Graph registry architecture

The system is driven by a single `GraphSpec` shape — the same one stored in MongoDB. The frontend's job is to **render a GraphSpec**, not to compute data.

```
GraphSpec (from API)
       │
       ▼
  <GraphBlock />          ← universal renderer
       │
       ├─ type="line"          → <ApexLineChart />
       ├─ type="multi_line"    → <ApexMultiLineChart />
       ├─ type="comparison"    → <ApexComparisonChart />
       ├─ type="bar"           → <ApexBarChart />
       ├─ type="projection"    → <ApexProjectionChart />
       ├─ type="tire_map"      → <ApexTireMapChart />
       ├─ type="sparkline"     → <ApexSparkline />
       └─ type="annotated_svg" → <ApexAnnotatedSVG />
```

### 7.3 Core type definitions

Add to `Frontend/src/types.ts`:

```typescript
export interface GraphSeries {
  id: string;
  label: string;
  driverNumber?: number;
  color: string;
  dataKey: string;
  strokeDash?: string;
  type: 'actual' | 'projected' | 'reference';
}

export interface GraphAnnotation {
  type: 'point' | 'band' | 'line' | 'label';
  xValue?: number | string;
  xRange?: [number | string, number | string];
  color: string;
  label: string;
}

export interface GraphSpec {
  id: string;
  type: 'line' | 'multi_line' | 'comparison' | 'bar' | 'bar_grouped' |
        'sparkline' | 'scatter' | 'area' | 'projection' |
        'tire_map' | 'heat_map' | 'annotated_svg';
  title?: string;
  subtitle?: string;
  xAxis?: { key: string; label: string; unit: string };
  yAxis?: { key: string; label: string; unit: string; domain?: [number, number] };
  series: GraphSeries[];
  dataPoints: Record<string, unknown>[];
  projectionConfig?: {
    method: 'linear' | 'polynomial' | 'exponential';
    historicalLaps: number;
    forecastLaps: number;
    confidenceBand: boolean;
  };
  annotations?: GraphAnnotation[];
  svgPaths?: { d: string; stroke: string; strokeWidth: number; fill: string }[];
  generatedByAI?: boolean;
}

export interface StoryContentBlock {
  type: 'paragraph' | 'heading' | 'quote' | 'stat' | 'graph_embed';
  text?: string;
  graphId?: string;        // resolved to GraphSpec before rendering
  graphSpec?: GraphSpec;   // populated after API fetch
  meta?: Record<string, unknown>;
}
```

### 7.4 GraphBlock component

**`Frontend/src/components/graphs/GraphBlock.tsx`**
```tsx
import { GraphSpec } from '../../types';
import { ApexLineChart } from './ApexLineChart';
import { ApexMultiLineChart } from './ApexMultiLineChart';
import { ApexComparisonChart } from './ApexComparisonChart';
import { ApexProjectionChart } from './ApexProjectionChart';
import { ApexBarChart } from './ApexBarChart';
import { ApexSparkline } from './ApexSparkline';
import { ApexTireMapChart } from './ApexTireMapChart';
import { ApexAnnotatedSVG } from './ApexAnnotatedSVG';

interface GraphBlockProps {
  spec: GraphSpec;
  caption?: string;
  className?: string;
}

export function GraphBlock({ spec, caption, className = '' }: GraphBlockProps) {
  return (
    <figure className={`bg-neutral-50 border border-neutral-200 p-6 space-y-4 ${className}`}>
      {spec.title && (
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
          <h3 className="font-mono text-[10px] font-bold text-neutral-900 uppercase tracking-[0.2em]">
            {spec.title}
          </h3>
          {spec.generatedByAI && (
            <span className="font-mono text-[8px] font-bold text-telemetry-blue bg-telemetry-blue/10 px-2 py-1 tracking-widest">
              AI GENERATED
            </span>
          )}
        </div>
      )}

      <div className="w-full">
        {spec.type === 'line'          && <ApexLineChart spec={spec} />}
        {spec.type === 'multi_line'    && <ApexMultiLineChart spec={spec} />}
        {spec.type === 'comparison'    && <ApexComparisonChart spec={spec} />}
        {spec.type === 'projection'    && <ApexProjectionChart spec={spec} />}
        {spec.type === 'bar'           && <ApexBarChart spec={spec} />}
        {spec.type === 'bar_grouped'   && <ApexBarChart spec={spec} grouped />}
        {spec.type === 'sparkline'     && <ApexSparkline spec={spec} />}
        {spec.type === 'tire_map'      && <ApexTireMapChart spec={spec} />}
        {spec.type === 'annotated_svg' && <ApexAnnotatedSVG spec={spec} />}
      </div>

      {caption && (
        <figcaption className="font-mono text-[9px] text-neutral-400 tracking-widest uppercase mt-2">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
```

### 7.5 Key chart implementations

**`Frontend/src/components/graphs/ApexProjectionChart.tsx`**
```tsx
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend, ResponsiveContainer
} from 'recharts';
import { GraphSpec } from '../../types';

export function ApexProjectionChart({ spec }: { spec: GraphSpec }) {
  const projConf = spec.projectionConfig;
  const splitLap = projConf
    ? spec.dataPoints.find(d => d[spec.series[1]?.dataKey] !== undefined)?.lap
    : null;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={spec.dataPoints} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="2 2" stroke="#f5f5f5" />
        <XAxis
          dataKey={spec.xAxis?.key ?? 'lap'}
          tick={{ fontFamily: 'monospace', fontSize: 9 }}
          label={{ value: spec.xAxis?.label, position: 'insideBottom', offset: -4, fontSize: 9 }}
        />
        <YAxis
          tick={{ fontFamily: 'monospace', fontSize: 9 }}
          domain={spec.yAxis?.domain ?? ['auto', 'auto']}
        />
        <Tooltip
          contentStyle={{ fontFamily: 'monospace', fontSize: 10 }}
          formatter={(v: number) => [`${v.toFixed(3)}s`, '']}
        />
        {spec.series.map(s => (
          s.type === 'actual'
            ? <Line key={s.id} type="monotone" dataKey={s.dataKey}
                stroke={s.color} strokeWidth={1.5} dot={false}
                name={s.label} connectNulls />
            : <Line key={s.id} type="monotone" dataKey={s.dataKey}
                stroke={s.color} strokeWidth={1.5}
                strokeDasharray={s.strokeDash ?? '4 2'}
                dot={false} name={s.label} connectNulls />
        ))}
        {projConf?.confidenceBand && (
          <Area dataKey="confidenceHigh" fill="#E10600" fillOpacity={0.05}
                stroke="none" />
        )}
        {splitLap && (
          <ReferenceLine x={splitLap} stroke="#E10600" strokeWidth={0.5}
            strokeDasharray="2 2"
            label={{ value: 'FORECAST →', position: 'top',
                     fontFamily: 'monospace', fontSize: 8, fill: '#E10600' }} />
        )}
        <Legend
          wrapperStyle={{ fontFamily: 'monospace', fontSize: 9, paddingTop: 12 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

**`Frontend/src/components/graphs/ApexAnnotatedSVG.tsx`** — replaces the current hard-coded SVG in StoryDetailPage:
```tsx
import { GraphSpec } from '../../types';

export function ApexAnnotatedSVG({ spec }: { spec: GraphSpec }) {
  return (
    <div className="relative h-64 w-full bg-white border border-neutral-100 overflow-hidden">
      <svg className="w-full h-full px-4" viewBox="0 0 100 40" preserveAspectRatio="none">
        {/* Dynamic grid */}
        {[10, 20, 30].map(y => (
          <line key={y} x1="0" y1={y} x2="100" y2={y}
                stroke="#f5f5f5" strokeWidth="0.1" />
        ))}
        {/* Annotations */}
        {spec.annotations?.map((ann, i) => (
          ann.type === 'band' && ann.xRange ? (
            <rect key={i}
              x={Number(ann.xRange[0])} y={0}
              width={Number(ann.xRange[1]) - Number(ann.xRange[0])} height={40}
              fill={ann.color} fillOpacity={0.05} />
          ) : ann.type === 'line' ? (
            <line key={i}
              x1={Number(ann.xValue)} y1={0}
              x2={Number(ann.xValue)} y2={40}
              stroke={ann.color} strokeWidth={0.2} strokeDasharray="1,1" />
          ) : null
        ))}
        {/* SVG series paths */}
        {spec.svgPaths?.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} stroke={p.stroke}
                strokeWidth={p.strokeWidth} />
        ))}
      </svg>
    </div>
  );
}
```

### 7.6 StoryRenderer component

Replace the current `StoryDetailPage` static layout with a block-based renderer:

**`Frontend/src/components/StoryRenderer.tsx`**
```tsx
import { StoryContentBlock } from '../types';
import { GraphBlock } from './graphs/GraphBlock';

interface StoryRendererProps {
  blocks: StoryContentBlock[];
}

export function StoryRenderer({ blocks }: StoryRendererProps) {
  return (
    <div className="space-y-8">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph':
            return <p key={i} className="font-sans text-lg text-neutral-500 leading-relaxed">{block.text}</p>;
          case 'heading':
            return <h2 key={i} className="font-serif text-3xl text-neutral-900 tracking-tight">{block.text}</h2>;
          case 'quote':
            return (
              <blockquote key={i} className="border-l-4 border-f1-red pl-6 italic font-serif text-xl text-neutral-700">
                {block.text}
              </blockquote>
            );
          case 'stat':
            return (
              <div key={i} className="bg-neutral-50 border border-neutral-200 p-6">
                <span className="font-mono text-4xl font-bold text-neutral-900">{block.meta?.value as string}</span>
                <span className="font-mono text-[10px] text-neutral-400 block mt-1 tracking-widest uppercase">{block.text}</span>
              </div>
            );
          case 'graph_embed':
            return block.graphSpec
              ? <GraphBlock key={i} spec={block.graphSpec} caption={block.meta?.caption as string} />
              : null;
          default:
            return null;
        }
      })}
    </div>
  );
}
```

---

## 8. Phase 6 — Frontend API Integration

### 8.1 API client layer

**`Frontend/src/lib/api.ts`**
```typescript
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',  // send cookies for refresh token
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? `API error ${res.status}`);
  }
  return res.json();
}

// Auth
export const api = {
  auth: {
    login:   (email: string, password: string) =>
               apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout:  () => apiFetch('/api/auth/logout', { method: 'POST' }),
    me:      () => apiFetch('/api/auth/me'),
    refresh: () => apiFetch('/api/auth/refresh', { method: 'POST' }),
  },
  stories: {
    list:    (page = 1, limit = 10, category?: string) =>
               apiFetch(`/api/stories?page=${page}&limit=${limit}${category ? `&category=${category}` : ''}`),
    get:     (slug: string) => apiFetch(`/api/stories/${slug}`),
    generate:(id: string)   => apiFetch(`/api/stories/${id}/generate`, { method: 'POST' }),
    runStatus:(id: string)  => apiFetch(`/api/stories/${id}/run-status`),
  },
  signals: {
    list:    (sessionKey: string) => apiFetch(`/api/signals?sessionKey=${sessionKey}`),
  },
  telemetry: {
    sessions: () => apiFetch('/api/telemetry/sessions'),
    session:  (key: string) => apiFetch(`/api/telemetry/sessions/${key}`),
    ingest:   (key: string) => apiFetch(`/api/telemetry/sessions/${key}/ingest`, { method: 'POST' }),
  },
  graphs: {
    forStory:   (storyId: string) => apiFetch(`/api/graphs?storyId=${storyId}`),
    forSession: (sessionKey: string) => apiFetch(`/api/graphs?sessionKey=${sessionKey}`),
  },
};
```

### 8.2 Auth context

**`Frontend/src/context/AuthContext.tsx`**
```tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';

interface User { id: string; displayName: string; email: string; role: string }
interface AuthCtx { user: User | null; loading: boolean; logout: () => Promise<void> }

const Ctx = createContext<AuthCtx>({ user: null, loading: true, logout: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
```

### 8.3 Replace hardcoded constants in pages

**Priority order:**

1. **`StoriesPage.tsx`** — replace `import { ARTICLES }` with `useEffect` → `api.stories.list()`, store in local state, render the same grid.
2. **`StoryDetailPage.tsx`** — replace `ARTICLES.find(...)` with `api.stories.get(slug)`, replace inline SVG block with `<StoryRenderer blocks={story.content} />`.
3. **`SignalsPage.tsx`** — replace `import { SIGNALS }` with `api.signals.list(activeSessionKey)`.
4. **`MagazinePage.tsx`** — replace `MAGAZINE_CONTENT` with fetched stories list + a `/api/telemetry/sessions` call for the live snapshot.

### 8.4 Update Vite config for API proxy (dev)

**`Frontend/vite.config.ts`**
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
```

---

## 9. Phase 7 — End-to-End Wiring & DevOps

### 9.1 Full user journey (happy path)

```
User visits /race
    │
    ▼
Frontend calls GET /api/telemetry/sessions
    │
    ▼
Backend returns cached list from MongoDB (or fetches from OpenF1 /meetings)
    │
    ▼
User selects "Monaco 2026 Race"
    │
    ▼
Frontend calls POST /api/telemetry/sessions/{key}/ingest
    │
    ▼
Backend:
  1. Fetches drivers, laps, stints, pit, weather from OpenF1
  2. Saves TelemetrySession to MongoDB
  3. POSTs to AI Worker: /run/telemetry-analysis
    │
    ▼
AI Worker (LangGraph):
  normalize → detect events → compute deltas → detect signals
  → build projections → generate graph specs → persist to MongoDB
    │
    ▼
Frontend polls GET /api/stories/{runId}/run-status
    │
    ▼
When status="done":
  Frontend calls POST /api/stories/{sessionId}/generate (trigger CrewAI)
    │
    ▼
AI Worker (CrewAI):
  TelemetryAnalyst reads session → SignalDetector ranks signals
  → StoryWriter drafts narrative → ChartCurator embeds graphs
  → FactChecker verifies → persists Story + GraphSpecs to MongoDB
    │
    ▼
Frontend navigates to new story URL /stories/{slug}
  StoryDetailPage fetches story content blocks
  Each 'graph_embed' block fetches its GraphSpec
  <GraphBlock /> renders the correct chart type
```

### 9.2 docker-compose.yml

```yaml
version: '3.9'
services:
  frontend:
    build: ./Frontend
    ports: ["3000:3000"]
    environment:
      - VITE_API_URL=http://localhost:4000
    depends_on: [backend]

  backend:
    build: ./Backend
    ports: ["4000:4000"]
    environment:
      - MONGODB_URI=mongodb://mongo:27017/apex
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - FRONTEND_URL=http://localhost:3000
      - AI_WORKER_URL=http://ai_worker:8000
    depends_on: [mongo]

  ai_worker:
    build: ./AI
    ports: ["8000:8000"]
    environment:
      - MONGODB_URI=mongodb://mongo:27017/apex
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - BACKEND_API_URL=http://backend:4000
    depends_on: [mongo]

  mongo:
    image: mongo:7
    volumes: ["mongo_data:/data/db"]
    ports: ["27017:27017"]

volumes:
  mongo_data:
```

### 9.3 npm scripts

**`Backend/package.json` scripts:**
```json
{
  "dev":   "ts-node-dev --respawn --transpile-only src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js",
  "seed":  "ts-node src/scripts/seed.ts"
}
```

**`AI/Makefile`:**
```makefile
run:
	uvicorn app.main:app --reload --port 8000
install:
	pip install -r requirements.txt
```

### 9.4 Environment variables (root `.env`)

```
# Shared
MONGODB_URI=mongodb://localhost:27017/apex

# Backend
PORT=4000
FRONTEND_URL=http://localhost:3000
JWT_SECRET=<generate with: openssl rand -hex 64>
JWT_REFRESH_SECRET=<generate with: openssl rand -hex 64>
AI_WORKER_URL=http://localhost:8000

# AI Worker
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key_if_needed
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash

# Frontend (prefix VITE_)
VITE_API_URL=http://localhost:4000
```

---

## 10. Environment Variables Reference

| Variable | Service | Required | Description |
|----------|---------|----------|-------------|
| `MONGODB_URI` | Backend, AI | ✅ | MongoDB connection string |
| `JWT_SECRET` | Backend | ✅ | Access token signing secret |
| `JWT_REFRESH_SECRET` | Backend | ✅ | Refresh token signing secret |
| `FRONTEND_URL` | Backend | ✅ | CORS allowed origin |
| `AI_WORKER_URL` | Backend | ✅ | URL of Python AI worker |
| `GEMINI_API_KEY` | AI | ✅ | For CrewAI + LangGraph LLM calls |
| `OPENAI_API_KEY` | AI | — | Alternative LLM provider |
| `LLM_PROVIDER` | AI | ✅ | `gemini` or `openai` |
| `LLM_MODEL` | AI | ✅ | e.g. `gemini-2.0-flash` |
| `VITE_API_URL` | Frontend | ✅ | Backend API base URL |
| `PORT` | Backend | — | Default `4000` |

---

## 11. API Contract Reference

### Auth endpoints

```
POST /api/auth/register
Body:  { email, password, displayName }
200:   { user: { id, email, displayName, role }, accessToken }

POST /api/auth/login
Body:  { email, password }
200:   { user, accessToken }
Sets:  Set-Cookie: refreshToken=...; HttpOnly; SameSite=Strict

POST /api/auth/refresh
Reads: Cookie refreshToken
200:   { accessToken }

POST /api/auth/logout
200:   { ok: true }
Clears refresh cookie

GET /api/auth/me
Auth:  Bearer accessToken
200:   { id, email, displayName, role, avatar }
```

### Stories

```
GET /api/stories?page=1&limit=10&category=Strategy&status=published
200: { stories: Story[], total, page, pages }

GET /api/stories/:slug
200: { ...story, content: StoryContentBlock[], graphSpecs: GraphSpec[] }
     (graphSpecs are resolved and embedded inline)

POST /api/stories/:id/generate
Auth: editor
Body: { sessionKey }
202: { runId, status: "queued" }

GET /api/stories/:id/run-status
200: { runId, status: "running"|"done"|"failed", logs: string[] }
```

### Telemetry

```
GET /api/telemetry/sessions
200: { sessions: [{ sessionKey, sessionName, circuitName, country, year, dateStart }] }

POST /api/telemetry/sessions/:key/ingest
Auth: editor
202: { sessionKey, status: "ingesting", storyRunId }

GET /api/telemetry/sessions/:key/laps?driver=16
200: { laps: [{ lap, lapTimeSec, sectors, compound, events }] }

GET /api/telemetry/sessions/:key/car?driver=16&lap=42
200: { carData: [{ date, rpm, speed, throttle, brake, drs, gear }] }
     (raw OpenF1 data, only fetched on demand)
```

### Graphs

```
GET /api/graphs?storyId=abc123
200: { graphs: GraphSpec[] }

GET /api/graphs/:id
200: GraphSpec

POST /api/graphs
Auth: editor
Body: GraphSpec (without id)
201: GraphSpec (with id)
```

---

## Implementation Sequence (Recommended Order)

```
Week 1  │ Monorepo setup → Backend scaffold → Auth (register/login/JWT/refresh)
Week 2  │ MongoDB schemas + seed script → Stories + Signals CRUD endpoints
Week 3  │ OpenF1 ingestion service → TelemetrySession caching + proxy routes
Week 4  │ LangGraph telemetry analysis pipeline (normalize → signals → projections → graph specs)
Week 5  │ CrewAI story generation pipeline (5 agents, full crew)
Week 6  │ Graph framework (GraphSpec type + GraphBlock + all chart components)
Week 7  │ Frontend API integration (replace constants.ts page by page)
Week 8  │ StoryRenderer + graph embedding in story detail view
Week 9  │ End-to-end test: ingest → analyze → generate → render
Week 10 │ Auth UI (login page, protected routes) + docker-compose final wiring
```

---

*End of implementation plan — Apex Intelligence Platform v1.0*
