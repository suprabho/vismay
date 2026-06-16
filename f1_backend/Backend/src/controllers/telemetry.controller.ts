import { Request, Response } from 'express';
import axios from 'axios';
import mongoose from 'mongoose';
import { TelemetrySession } from '../models/TelemetrySession.model';
import { CarPosition } from '../models/CarPosition.model';
import { Circuit } from '../models/Circuit.model';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import { env } from '../config/env';

const ONE_HOUR_MS = 60 * 60 * 1000;
const SCHEDULE_CACHE_MS = 10 * 60 * 1000;

interface AvailableSession {
  sessionKey:   string;
  year:         number;
  round:        number;
  gpName:       string;
  sessionType:  string;
  sessionName:  string;
  sessionDate:  string | null;
  country:      string;
  circuitName:  string;
  eventFormat:  string;
}

const scheduleCache = new Map<number, { fetchedAt: number; sessions: AvailableSession[] }>();

// ── List Available Sessions (Fast-F1 schedule proxy) ──────────────────────────

export const listAvailableSessions = asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year);
  if (!year || Number.isNaN(year)) {
    res.status(400).json({ message: 'year query param is required' });
    return;
  }

  const cached = scheduleCache.get(year);
  if (cached && Date.now() - cached.fetchedAt < SCHEDULE_CACHE_MS) {
    res.json({ sessions: cached.sessions, cached: true });
    return;
  }

  try {
    const { data } = await axios.get<{ sessions: AvailableSession[] }>(
      `${env.AI_WORKER_URL}/sessions/available`,
      {
        params:  { year },
        headers: { 'X-Worker-Secret': env.AI_WORKER_SECRET },
        timeout: 30_000,
      },
    );
    scheduleCache.set(year, { fetchedAt: Date.now(), sessions: data.sessions });
    res.json({ sessions: data.sessions, cached: false });
  } catch (err) {
    logger.error('[telemetry] AI Worker schedule fetch failed', { error: String(err) });
    res.status(502).json({ message: 'Schedule fetch failed in AI Worker', detail: String(err) });
  }
});

// ── List Sessions (with ingestion-completeness counts) ────────────────────────

export const listSessions = asyncHandler(async (req: Request, res: Response) => {
  const filter: Record<string, unknown> = {};
  if (req.query.year)    filter.year        = Number(req.query.year);
  if (req.query.circuit) filter.circuitName = new RegExp(String(req.query.circuit), 'i');

  const [sessions, positionsByKey] = await Promise.all([
    TelemetrySession.aggregate<{ sessionKey: string } & Record<string, unknown>>([
      { $match: filter },
      { $sort: { dateStart: -1 } },
      { $project: {
          _id:              0,
          sessionKey:       1,
          sessionName:      1,
          circuitName:      1,
          country:          1,
          year:             1,
          dateStart:        1,
          ingestedAt:       1,
          telemetryStatus:  1,
          telemetryError:   1,
          positionsStatus:  1,
          positionsError:   1,
          circuitKey:       1,
          driverCount:      { $size: { $ifNull: ['$drivers', []] } },
          lapCount:         { $size: { $ifNull: ['$processedLaps', []] } },
          aggregateCount:   { $size: { $ifNull: ['$lapTelemetryAggregates', []] } },
          weatherRowCount:  { $size: { $ifNull: ['$weatherData', []] } },
          raceControlCount: { $size: { $ifNull: ['$raceControlMessages', []] } },
          resultsCount:     { $size: { $ifNull: ['$sessionResults', []] } },
          stintCount:       { $size: { $ifNull: ['$stints', []] } },
      } },
    ]),
    CarPosition.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$sessionKey', count: { $sum: 1 } } },
    ]),
  ]);

  const positionsMap = new Map(positionsByKey.map(p => [p._id, p.count]));
  const enriched = sessions.map(s => ({
    ...s,
    positionsDriverCount: positionsMap.get(s.sessionKey) ?? 0,
  }));

  res.json({ sessions: enriched });
});

// ── Get Single Session ────────────────────────────────────────────────────────

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await TelemetrySession.findOne({ sessionKey: req.params.sessionKey })
    .select('-processedLaps -lapTelemetryAggregates') // large arrays served separately
    .lean();

  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }
  res.json(session);
});

// ── Get Session Laps ──────────────────────────────────────────────────────────

export const getSessionLaps = asyncHandler(async (req: Request, res: Response) => {
  const session = await TelemetrySession.findOne({ sessionKey: req.params.sessionKey })
    .select('processedLaps sessionKey')
    .lean();

  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  let laps = session.processedLaps;
  if (req.query.driver) {
    const num = Number(req.query.driver);
    laps = laps.filter(l => l.driverNumber === num);
  }

  res.json({ sessionKey: session.sessionKey, laps });
});

// ── Ingest Session ────────────────────────────────────────────────────────────

export const ingestSession = asyncHandler(async (req: Request, res: Response) => {
  // Body validated + coerced by IngestSessionSchema (telemetry.routes.ts)
  const { year, gpName, sessionType } = req.body as {
    year: number; gpName: string; sessionType: string;
  };

  const slug = String(gpName).toLowerCase().replace(/[\s-]+/g, '_');
  const sessionKey = `${year}_${slug}_${sessionType}`;

  // Skip only when ingest is recent AND enrichment completed; otherwise re-run
  // so users can recover from pending/processing/failed states.
  const existing = await TelemetrySession.findOne({ sessionKey });
  if (
    existing?.ingestedAt &&
    existing.telemetryStatus === 'done' &&
    Date.now() - existing.ingestedAt.getTime() < ONE_HOUR_MS
  ) {
    res.json({ sessionKey, status: 'cached', ingestedAt: existing.ingestedAt });
    return;
  }

  logger.info(`[telemetry] Delegating ingestion to AI Worker for ${sessionKey}`);

  // Delegate data loading + MongoDB upsert to AI Worker (Fast-F1)
  try {
    await axios.post(
      `${env.AI_WORKER_URL}/ingest/session`,
      { year: Number(year), gp_name: String(gpName), session_type: String(sessionType) },
      { headers: { 'X-Worker-Secret': env.AI_WORKER_SECRET }, timeout: 120_000 },
    );
  } catch (err) {
    logger.error('[telemetry] AI Worker ingestion failed', { error: String(err) });
    res.status(502).json({ message: 'Ingestion failed in AI Worker', detail: String(err) });
    return;
  }

  const fresh = await TelemetrySession.findOne({ sessionKey }).lean();

  logger.info(`[telemetry] Ingestion complete for ${sessionKey}`);

  res.json({
    sessionKey,
    status:     'ingested',
    lapsCount:  fresh?.processedLaps?.length ?? 0,
    ingestedAt: fresh?.ingestedAt,
  });
});

// ── Get Session Status (lightweight poll) ─────────────────────────────────────

export const getSessionStatus = asyncHandler(async (req: Request, res: Response) => {
  const [doc] = await TelemetrySession.aggregate([
    { $match: { sessionKey: req.params.sessionKey } },
    {
      $project: {
        _id:               0,
        sessionKey:        1,
        telemetryStatus:   1,
        telemetryError:    1,
        positionsStatus:   1,
        positionsError:    1,
        circuitKey:        1,
        ingestedAt:        1,
        lapAggregateCount: { $size: { $ifNull: ['$lapTelemetryAggregates', []] } },
      },
    },
  ]);

  if (!doc) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }
  res.json(doc);
});

// ── sessionKey parser ─────────────────────────────────────────────────────────

interface ParsedSessionKey { year: number; gpName: string; sessionType: string; }

function parseSessionKey(sessionKey: string): ParsedSessionKey | null {
  const parts = sessionKey.split('_');
  if (parts.length < 3) return null;
  const year        = Number(parts[0]);
  const sessionType = parts[parts.length - 1];
  const gpName      = parts.slice(1, -1).join(' ');
  if (!Number.isFinite(year) || !sessionType || !gpName) return null;
  return { year, gpName, sessionType };
}

// ── Retry Enrichment (Phase 2 only) ───────────────────────────────────────────

export const retryEnrichment = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey } = req.params;

  const session = await TelemetrySession.findOne({ sessionKey }).select('sessionKey').lean();
  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const parsed = parseSessionKey(sessionKey);
  if (!parsed) {
    res.status(400).json({ message: 'Invalid sessionKey format' });
    return;
  }

  try {
    await axios.post(
      `${env.AI_WORKER_URL}/ingest/enrich-only`,
      { year: parsed.year, gp_name: parsed.gpName, session_type: parsed.sessionType },
      { headers: { 'X-Worker-Secret': env.AI_WORKER_SECRET }, timeout: 10_000 },
    );
  } catch (err) {
    logger.error('[telemetry] AI Worker enrich-only dispatch failed', { error: String(err) });
    res.status(502).json({ message: 'Enrich dispatch failed', detail: String(err) });
    return;
  }

  res.status(202).json({ sessionKey, status: 'enrichment_queued' });
});

// ── Retry Position Enrichment (Phase 3) ───────────────────────────────────────

export const retryPositions = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey } = req.params;

  const session = await TelemetrySession.findOne({ sessionKey }).select('sessionKey').lean();
  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const parsed = parseSessionKey(sessionKey);
  if (!parsed) {
    res.status(400).json({ message: 'Invalid sessionKey format' });
    return;
  }

  try {
    await axios.post(
      `${env.AI_WORKER_URL}/ingest/enrich-positions`,
      { year: parsed.year, gp_name: parsed.gpName, session_type: parsed.sessionType },
      { headers: { 'X-Worker-Secret': env.AI_WORKER_SECRET }, timeout: 10_000 },
    );
  } catch (err) {
    logger.error('[telemetry] AI Worker enrich-positions dispatch failed', { error: String(err) });
    res.status(502).json({ message: 'Position enrichment dispatch failed', detail: String(err) });
    return;
  }

  res.status(202).json({ sessionKey, status: 'positions_enrichment_queued' });
});

// ── Positions ─────────────────────────────────────────────────────────────────

export const listSessionPositions = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey } = req.params;
  const drivers = await CarPosition.find({ sessionKey })
    // updatedAt lets the client cache-bust the immutable per-driver track URL after
    // a z-backfill re-run (see getDriverPositions Cache-Control).
    .select('driverNumber sampleRateHz frameCount t0Ms tEndMs circuitKey updatedAt')
    .sort({ driverNumber: 1 })
    .lean();
  res.json({ sessionKey, drivers });
});

export const getDriverPositions = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey, driverNumber } = req.params;
  const dn = Number(driverNumber);
  if (!Number.isFinite(dn)) {
    res.status(400).json({ message: 'driverNumber must be a number' });
    return;
  }

  const lapFrom = req.query.lapFrom ? Number(req.query.lapFrom) : null;
  const lapTo   = req.query.lapTo   ? Number(req.query.lapTo)   : null;

  // Cheap projection: just enough to compute ETag and decide cache strategy.
  // Avoids hydrating + serializing the giant frames arrays on revalidation hits.
  const meta = await CarPosition.findOne(
    { sessionKey, driverNumber: dn },
    { updatedAt: 1, frameCount: 1 }
  ).lean();
  if (!meta) {
    res.status(404).json({ message: 'No positions for this driver' });
    return;
  }

  const updatedAtMs = meta.updatedAt ? new Date(meta.updatedAt).getTime() : 0;
  const etag = `"pos-${sessionKey}-${dn}-${updatedAtMs}-${lapFrom ?? ''}-${lapTo ?? ''}"`;

  // Immutable once frames are populated (see plan: _enrich_positions writes once).
  const isImmutable = (meta.frameCount ?? 0) > 0;
  const cacheControl = isImmutable
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=30, must-revalidate';

  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', cacheControl);

  if (req.header('If-None-Match') === etag) {
    res.status(304).end();
    return;
  }

  const doc = await CarPosition.findOne({ sessionKey, driverNumber: dn }).lean();
  if (!doc) {
    res.status(404).json({ message: 'No positions for this driver' });
    return;
  }

  if (lapFrom != null || lapTo != null) {
    const { t, x, y, z, lap, status } = doc.frames;
    const ft: number[] = [];
    const fx: number[] = [];
    const fy: number[] = [];
    const fl: number[] = [];
    const fs: number[] = [];
    const fz: number[] | null = z ? [] : null; // preserve elevation when present
    for (let i = 0; i < t.length; i++) {
      const lapNum = lap[i];
      if (lapFrom != null && lapNum < lapFrom) continue;
      if (lapTo   != null && lapNum > lapTo)   continue;
      ft.push(t[i]); fx.push(x[i]); fy.push(y[i]); fl.push(lapNum); fs.push(status[i]);
      if (fz && z) fz.push(z[i]);
    }
    res.json({
      sessionKey:   doc.sessionKey,
      circuitKey:   doc.circuitKey,
      driverNumber: doc.driverNumber,
      sampleRateHz: doc.sampleRateHz,
      frameCount:   ft.length,
      t0Ms:         ft[0] ?? 0,
      tEndMs:       ft[ft.length - 1] ?? 0,
      frames:       { t: ft, x: fx, y: fy, lap: fl, status: fs, ...(fz ? { z: fz } : {}) },
    });
    return;
  }

  res.json(doc);
});

// ── Lap Telemetry Aggregates ──────────────────────────────────────────────────

export const getSessionAggregates = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey } = req.params;
  const session = await TelemetrySession.findOne({ sessionKey })
    .select('sessionKey telemetryStatus lapTelemetryAggregates')
    .lean();
  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }
  let aggregates = session.lapTelemetryAggregates ?? [];
  if (req.query.driver) {
    const dn = Number(req.query.driver);
    aggregates = aggregates.filter(a => a.driverNumber === dn);
  }
  res.json({
    sessionKey: session.sessionKey,
    ready: (session as { telemetryStatus?: string }).telemetryStatus === 'done',
    aggregates,
  });
});

// ── Sector Bests ──────────────────────────────────────────────────────────────

interface DriverSectorBest {
  s1: number; s2: number; s3: number;
  s1Lap: number; s2Lap: number; s3Lap: number;
}

interface PurpleSector { time: number; driverNumber: number; lap: number; }

export const getSectorBests = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey } = req.params;
  const session = await TelemetrySession.findOne({ sessionKey })
    .select('sessionKey processedLaps')
    .lean();
  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const driverBests: Record<number, DriverSectorBest> = {};
  const purple: { s1: PurpleSector | null; s2: PurpleSector | null; s3: PurpleSector | null } = {
    s1: null, s2: null, s3: null,
  };

  for (const lap of session.processedLaps ?? []) {
    const sectors = lap.sectors ?? [];
    const s1 = sectors[0] ?? 0;
    const s2 = sectors[1] ?? 0;
    const s3 = sectors[2] ?? 0;
    const dn = lap.driverNumber;

    let best = driverBests[dn];
    if (!best) {
      best = { s1: Infinity, s2: Infinity, s3: Infinity, s1Lap: 0, s2Lap: 0, s3Lap: 0 };
      driverBests[dn] = best;
    }

    if (s1 > 0 && s1 < best.s1) { best.s1 = s1; best.s1Lap = lap.lap; }
    if (s2 > 0 && s2 < best.s2) { best.s2 = s2; best.s2Lap = lap.lap; }
    if (s3 > 0 && s3 < best.s3) { best.s3 = s3; best.s3Lap = lap.lap; }

    if (s1 > 0 && (!purple.s1 || s1 < purple.s1.time)) {
      purple.s1 = { time: s1, driverNumber: dn, lap: lap.lap };
    }
    if (s2 > 0 && (!purple.s2 || s2 < purple.s2.time)) {
      purple.s2 = { time: s2, driverNumber: dn, lap: lap.lap };
    }
    if (s3 > 0 && (!purple.s3 || s3 < purple.s3.time)) {
      purple.s3 = { time: s3, driverNumber: dn, lap: lap.lap };
    }
  }

  // Replace Infinity with null so JSON is clean
  for (const dn of Object.keys(driverBests)) {
    const b = driverBests[Number(dn)];
    if (!Number.isFinite(b.s1)) { b.s1 = 0; b.s1Lap = 0; }
    if (!Number.isFinite(b.s2)) { b.s2 = 0; b.s2Lap = 0; }
    if (!Number.isFinite(b.s3)) { b.s3 = 0; b.s3Lap = 0; }
  }

  res.json({ sessionKey: session.sessionKey, driverBests, sessionPurple: purple });
});

// ── Session Summary (admin ingestion dossier) ─────────────────────────────────

interface RawLapTelemetryDoc {
  sessionKey:   string;
  driverNumber: number;
  lap:          number;
  frameCount:   number;
  sessionTime?: number[];
  speed?:       number[];
  throttle?:    number[];
  brake?:       number[];
  drs?:         number[];
  nGear?:       number[];
  rpm?:         number[];
  z?:           number[];
  distance?:    number[];
}

function firstFrame(doc: RawLapTelemetryDoc | null): Record<string, unknown> | null {
  if (!doc) return null;
  const at = (arr: number[] | undefined): number | null => (arr && arr.length > 0 ? arr[0] : null);
  return {
    sessionTime: at(doc.sessionTime),
    speed:       at(doc.speed),
    throttle:    at(doc.throttle),
    brake:       at(doc.brake),
    drs:         at(doc.drs),
    nGear:       at(doc.nGear),
    rpm:         at(doc.rpm),
    z:           at(doc.z),
    distance:    at(doc.distance),
  };
}

export const getSessionSummary = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey } = req.params;

  const sessionDoc = await TelemetrySession.findOne({ sessionKey })
    .select({
      sessionKey: 1, sessionName: 1, circuitName: 1, country: 1, year: 1,
      dateStart: 1, ingestedAt: 1,
      telemetryStatus: 1, telemetryError: 1,
      positionsStatus: 1, positionsError: 1,
      circuitKey: 1,
      drivers: 1,
      stints: 1,
      processedLaps: { $slice: 1 },
      lapTelemetryAggregates: { $slice: 1 },
      sessionResults: { $slice: 1 },
      weatherData: { $slice: 1 },
      raceControlMessages: { $slice: 1 },
    })
    .lean();

  if (!sessionDoc) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  // Counts not derivable from $slice'd projection — need separate aggregation
  const [countsDoc] = await TelemetrySession.aggregate<{
    laps: number; aggregates: number; weatherRows: number; raceControlEvents: number;
    results: number; stints: number;
  }>([
    { $match: { sessionKey } },
    { $project: {
        _id: 0,
        laps:              { $size: { $ifNull: ['$processedLaps', []] } },
        aggregates:        { $size: { $ifNull: ['$lapTelemetryAggregates', []] } },
        weatherRows:       { $size: { $ifNull: ['$weatherData', []] } },
        raceControlEvents: { $size: { $ifNull: ['$raceControlMessages', []] } },
        results:           { $size: { $ifNull: ['$sessionResults', []] } },
        stints:            { $size: { $ifNull: ['$stints', []] } },
    } },
  ]);

  const positionsDrivers = await CarPosition.countDocuments({ sessionKey });
  const positionSample = await CarPosition.findOne({ sessionKey })
    .select('driverNumber frameCount sampleRateHz frames')
    .lean();

  const circuitDoc = sessionDoc.circuitKey
    ? await Circuit.findOne({ circuitKey: sessionDoc.circuitKey, year: sessionDoc.year })
        .select({ _id: 1, corners: { $slice: 0 } })
        .lean()
    : null;

  // raw_lap_telemetry has no Mongoose model — query collection directly
  const rawColl = mongoose.connection.db?.collection<RawLapTelemetryDoc>('raw_lap_telemetry');
  const rawSample = rawColl ? await rawColl.findOne({ sessionKey }) : null;
  const rawTelemetryDocs = rawColl ? await rawColl.countDocuments({ sessionKey }) : 0;

  // Build position sample's first frame
  const carPositionSample = positionSample && positionSample.frames
    ? {
        driverNumber: positionSample.driverNumber,
        frameCount:   positionSample.frameCount,
        sampleRateHz: positionSample.sampleRateHz,
        firstFrame: {
          t:      positionSample.frames.t?.[0] ?? null,
          x:      positionSample.frames.x?.[0] ?? null,
          y:      positionSample.frames.y?.[0] ?? null,
          lap:    positionSample.frames.lap?.[0] ?? null,
          status: positionSample.frames.status?.[0] ?? null,
        },
      }
    : null;

  res.json({
    sessionKey:      sessionDoc.sessionKey,
    sessionName:     sessionDoc.sessionName,
    circuitName:     sessionDoc.circuitName,
    country:         sessionDoc.country,
    year:            sessionDoc.year,
    dateStart:       sessionDoc.dateStart,
    ingestedAt:      sessionDoc.ingestedAt,
    telemetryStatus: sessionDoc.telemetryStatus,
    telemetryError:  sessionDoc.telemetryError,
    positionsStatus: sessionDoc.positionsStatus,
    positionsError:  sessionDoc.positionsError,
    circuitKey:      sessionDoc.circuitKey,
    circuitPresent:  circuitDoc != null,
    counts: {
      drivers:           sessionDoc.drivers?.length ?? 0,
      laps:              countsDoc?.laps ?? 0,
      aggregates:        countsDoc?.aggregates ?? 0,
      weatherRows:       countsDoc?.weatherRows ?? 0,
      raceControlEvents: countsDoc?.raceControlEvents ?? 0,
      results:           countsDoc?.results ?? 0,
      stints:            countsDoc?.stints ?? 0,
      positionsDrivers,
      rawTelemetryDocs,
    },
    drivers: sessionDoc.drivers ?? [],
    samples: {
      processedLap:      sessionDoc.processedLaps?.[0]          ?? null,
      lapAggregate:      sessionDoc.lapTelemetryAggregates?.[0] ?? null,
      sessionResult:     sessionDoc.sessionResults?.[0]         ?? null,
      weatherRow:        sessionDoc.weatherData?.[0]            ?? null,
      raceControlEvent:  sessionDoc.raceControlMessages?.[0]    ?? null,
      stint:             sessionDoc.stints?.[0]                 ?? null,
      rawTelemetryFrame: rawSample
        ? {
            sessionKey:   rawSample.sessionKey,
            driverNumber: rawSample.driverNumber,
            lap:          rawSample.lap,
            frameCount:   rawSample.frameCount,
            firstFrame:   firstFrame(rawSample),
          }
        : null,
      carPositionFrame: carPositionSample,
    },
  });
});

// ── Story Telemetry Clip Resolver ─────────────────────────────────────────────
//
// Single endpoint that bundles everything a story-page TelemetryClipPlayer needs
// for an angle-scoped lap window: circuit geometry, the relevant drivers' meta,
// per-lap timing, sector bests, downsampled car_positions tracks, and
// downsampled raw_lap_telemetry traces. Bundling avoids 5+ sequential fetches.
//
// Query params:
//   drivers=1,44     (required, 1–3 drivers)
//   lapFrom=12       (required, inclusive)
//   lapTo=14         (required, inclusive)
//   channels=speed,throttle,brake,drs,nGear,rpm  (optional, default: speed,throttle,brake)
//   hz=15            (optional, target sample rate for raw telemetry, default 15, max 30)

const VALID_CLIP_CHANNELS = new Set(['speed', 'throttle', 'brake', 'drs', 'nGear', 'rpm']);

interface ClipFrames {
  t:      number[];
  x:      number[];
  y:      number[];
  lap:    number[];
  status: number[];
}

interface RawTelemetryFrame {
  sessionKey:   string;
  driverNumber: number;
  lap:          number;
  frameCount:   number;
  sessionTime?: number[];
  speed?:       number[];
  throttle?:    number[];
  brake?:       number[];
  drs?:         number[];
  nGear?:       number[];
  rpm?:         number[];
  distance?:    number[];
}

function downsampleByStride<T>(arr: T[] | undefined, stride: number): T[] {
  if (!arr || arr.length === 0) return [];
  if (stride <= 1) return arr.slice();
  const out: T[] = [];
  for (let i = 0; i < arr.length; i += stride) out.push(arr[i]);
  // Always keep the last frame so animation ends cleanly.
  if (out[out.length - 1] !== arr[arr.length - 1]) out.push(arr[arr.length - 1]);
  return out;
}

export const getTelemetryClip = asyncHandler(async (req: Request, res: Response) => {
  const { sessionKey } = req.params;

  const driversRaw = String(req.query.drivers ?? '').trim();
  const lapFrom    = Number(req.query.lapFrom);
  const lapTo      = Number(req.query.lapTo);
  if (!driversRaw || !Number.isFinite(lapFrom) || !Number.isFinite(lapTo) || lapTo < lapFrom) {
    res.status(400).json({ message: 'drivers, lapFrom and lapTo (lapTo >= lapFrom) are required' });
    return;
  }

  const driverNumbers = driversRaw
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isFinite(n) && n > 0)
    .slice(0, 3); // cap at 3 — UI only animates a few cars at once

  if (driverNumbers.length === 0) {
    res.status(400).json({ message: 'drivers must contain at least one numeric driver number' });
    return;
  }

  const channels = String(req.query.channels ?? 'speed,throttle,brake')
    .split(',')
    .map(s => s.trim())
    .filter(c => VALID_CLIP_CHANNELS.has(c));

  const targetHzRaw = Number(req.query.hz);
  const targetHz = Number.isFinite(targetHzRaw)
    ? Math.min(30, Math.max(1, targetHzRaw))
    : 15;

  // ── Session header + driver roster ──────────────────────────────────────────
  const session = await TelemetrySession.findOne({ sessionKey })
    .select('sessionKey circuitKey circuitName year drivers positionsStatus')
    .lean();
  if (!session) {
    res.status(404).json({ message: 'Session not found' });
    return;
  }

  const focalDrivers = (session.drivers ?? [])
    .filter(d => driverNumbers.includes(d.driverNumber))
    .map(d => ({
      driverNumber: d.driverNumber,
      abbreviation: d.abbreviation,
      fullName:     d.fullName,
      teamName:     d.teamName,
      teamColour:   d.teamColour,
    }));

  // ── Circuit geometry (optional — clip still renders without it) ─────────────
  const circuit = session.circuitKey
    ? await Circuit.findOne({ circuitKey: session.circuitKey, year: session.year })
        .sort({ year: -1 })
        .lean()
    : null;

  // ── Per-driver: processedLaps in range + sector bests inline ────────────────
  const lapDoc = await TelemetrySession.findOne({ sessionKey })
    .select('processedLaps')
    .lean();
  const lapsByDriver: Record<number, IProcessedLapBrief[]> = {};
  for (const dn of driverNumbers) lapsByDriver[dn] = [];
  for (const lap of lapDoc?.processedLaps ?? []) {
    if (!driverNumbers.includes(lap.driverNumber)) continue;
    if (lap.lap < lapFrom || lap.lap > lapTo) continue;
    lapsByDriver[lap.driverNumber].push({
      driverNumber: lap.driverNumber,
      lap:          lap.lap,
      lapTimeSec:   lap.lapTimeSec ?? null,
      sectors:      lap.sectors ?? [],
      compound:     lap.compound,
      stintLap:     lap.stintLap,
    });
  }

  // ── Car positions (X/Y over time), downsampled and clipped to lap window ────
  const carDocs = await CarPosition.find({
    sessionKey,
    driverNumber: { $in: driverNumbers },
  }).lean();

  // The position sampleRateHz from ingest is fixed at ~4 Hz already (see
  // _enrich_positions), so we keep them as-is — further downsampling produces a
  // jittery animation.
  const tracks = carDocs.map(doc => {
    const { t, x, y, lap, status } = doc.frames as ClipFrames;
    const ft: number[] = [];
    const fx: number[] = [];
    const fy: number[] = [];
    const fl: number[] = [];
    const fs: number[] = [];
    for (let i = 0; i < t.length; i++) {
      const lapNum = lap[i];
      if (lapNum < lapFrom || lapNum > lapTo) continue;
      ft.push(t[i]); fx.push(x[i]); fy.push(y[i]); fl.push(lapNum); fs.push(status[i]);
    }
    return {
      driverNumber: doc.driverNumber,
      sampleRateHz: doc.sampleRateHz,
      frameCount:   ft.length,
      t0Ms:         ft[0] ?? 0,
      tEndMs:       ft[ft.length - 1] ?? 0,
      frames:       { t: ft, x: fx, y: fy, lap: fl, status: fs },
    };
  });

  // If no position tracks were found and positions aren't done enriching,
  // return early with 202 so the frontend can show a meaningful message.
  const posStatus = (session as { positionsStatus?: string }).positionsStatus;
  if (tracks.length === 0 && focalDrivers.length > 0 && posStatus !== 'done') {
    res.status(202).json({
      status:          'positions_not_ready',
      positionsStatus: posStatus ?? 'unknown',
      message:         'Car position data is still being processed. Retry shortly.',
    });
    return;
  }

  // ── Raw per-lap telemetry traces (speed/throttle/brake/…) ───────────────────
  const rawColl = mongoose.connection.db?.collection<RawTelemetryFrame>('raw_lap_telemetry');
  const telemetry: Array<{
    driverNumber: number;
    lap:          number;
    frameCount:   number;
    sampleRateHz: number;
    sessionTime:  number[];
    distance:     number[];
  } & Record<string, unknown>> = [];

  if (rawColl) {
    const rawDocs = await rawColl
      .find({
        sessionKey,
        driverNumber: { $in: driverNumbers },
        lap:          { $gte: lapFrom, $lte: lapTo },
      })
      .toArray();

    for (const doc of rawDocs) {
      const native = doc.sessionTime?.length ?? 0;
      if (native === 0) continue;

      // Pick a stride so we land near targetHz. raw_lap_telemetry from Fast-F1
      // is typically ~100 Hz per lap, so a stride of ~7 yields ~15 Hz.
      const durationSec = native > 1
        ? Math.max(0.001, ((doc.sessionTime ?? [])[native - 1] - (doc.sessionTime ?? [])[0]))
        : 1;
      const nativeHz = native / durationSec;
      const stride = Math.max(1, Math.round(nativeHz / targetHz));

      const entry: any = {
        driverNumber: doc.driverNumber,
        lap:          doc.lap,
        frameCount:   0,
        sampleRateHz: targetHz,
        sessionTime:  downsampleByStride(doc.sessionTime, stride),
        distance:     downsampleByStride(doc.distance, stride),
      };
      for (const ch of channels) {
        entry[ch] = downsampleByStride(doc[ch as keyof RawTelemetryFrame] as number[] | undefined, stride);
      }
      entry.frameCount = entry.sessionTime.length;
      telemetry.push(entry);
    }
  }

  // ── Sector bests for the lap window (purple / driver PB highlighting) ───────
  const sbDriverBests: Record<number, { s1: number; s2: number; s3: number; s1Lap: number; s2Lap: number; s3Lap: number }> = {};
  for (const dn of driverNumbers) {
    sbDriverBests[dn] = { s1: 0, s2: 0, s3: 0, s1Lap: 0, s2Lap: 0, s3Lap: 0 };
    let s1 = Infinity, s2 = Infinity, s3 = Infinity;
    let s1Lap = 0, s2Lap = 0, s3Lap = 0;
    for (const lap of lapsByDriver[dn]) {
      const sectors = lap.sectors ?? [];
      const a = sectors[0] ?? 0;
      const b = sectors[1] ?? 0;
      const c = sectors[2] ?? 0;
      if (a > 0 && a < s1) { s1 = a; s1Lap = lap.lap; }
      if (b > 0 && b < s2) { s2 = b; s2Lap = lap.lap; }
      if (c > 0 && c < s3) { s3 = c; s3Lap = lap.lap; }
    }
    sbDriverBests[dn] = {
      s1: Number.isFinite(s1) ? s1 : 0,
      s2: Number.isFinite(s2) ? s2 : 0,
      s3: Number.isFinite(s3) ? s3 : 0,
      s1Lap, s2Lap, s3Lap,
    };
  }

  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');

  res.json({
    sessionKey,
    circuitKey:  session.circuitKey,
    circuitName: session.circuitName,
    year:        session.year,
    lapFrom,
    lapTo,
    channels,
    drivers:     focalDrivers,
    circuit:     circuit
      ? {
          circuitKey:       circuit.circuitKey,
          circuitName:      circuit.circuitName,
          country:          (circuit as { country?: string }).country ?? '',
          rotationDeg:      circuit.rotationDeg,
          corners:          circuit.corners ?? [],
          outline:          circuit.outline,
          bounds:           circuit.bounds,
          sectorBoundaries: (circuit as { sectorBoundaries?: { index1: number; index2: number } | null }).sectorBoundaries ?? null,
        }
      : null,
    lapsByDriver,
    sectorBests: sbDriverBests,
    tracks,
    telemetry,
  });
});

interface IProcessedLapBrief {
  driverNumber: number;
  lap:          number;
  lapTimeSec:   number | null;
  sectors:      Array<number | null>;
  compound:     string;
  stintLap:     number;
}

// ── Circuit ───────────────────────────────────────────────────────────────────

export const getCircuit = asyncHandler(async (req: Request, res: Response) => {
  const { circuitKey } = req.params;
  const year = req.query.year ? Number(req.query.year) : null;

  const query: Record<string, unknown> = { circuitKey };
  if (year) query.year = year;

  // If no year specified, return the most recently updated revision
  const circuit = await Circuit.findOne(query).sort({ year: -1 }).lean();
  if (!circuit) {
    res.status(404).json({ message: 'Circuit not found' });
    return;
  }
  res.json(circuit);
});
