import { z } from 'zod';

/** POST /api/telemetry/ingest — { year, gpName, sessionType } */
export const IngestSessionSchema = z.object({
  year:        z.coerce.number().int().min(1950).max(2100),
  gpName:      z.string().trim().min(1).max(100),
  // Fast-F1 session identifiers: R, Q, S, SQ, FP1-FP3 — regex (not enum) so new types pass
  sessionType: z.string().trim().regex(/^[A-Za-z0-9]{1,3}$/, 'invalid session type'),
});

export type IngestSessionBody = z.infer<typeof IngestSessionSchema>;
