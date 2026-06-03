import { z } from 'zod';

const TelemetryFieldSchema = z.object({
  label:      z.string().min(1),
  value:      z.string().min(1),
  colorToken: z.string().min(1),
  percentage: z.number().min(0).max(100).optional(),
});

export const CreateSignalSchema = z.object({
  sessionKey:      z.string().min(1),
  lap:             z.number().int().nonnegative().nullable().default(null),
  location:        z.string().min(1).max(100),
  priority:        z.enum(['high', 'med', 'low']),
  title:           z.string().min(1).max(300),
  meaning:         z.string().min(1),
  implication:     z.string().min(1),
  telemetryFields: z.array(TelemetryFieldSchema).default([]),
  driverNumber:    z.number().int().positive().nullable().default(null),
  teamId:          z.string().nullable().optional(),
  teamName:        z.string().nullable().optional(),
  scopeKind:       z.enum(['session', 'driver', 'team']).optional(),
  aiGenerated:     z.boolean().default(false),
});

export const UpdateSignalSchema = CreateSignalSchema.partial();

/**
 * Bulk create. `replaceExisting` (used by the AI worker) clears prior
 * AI-generated signals for the given sessionKey before inserting — makes re-runs
 * idempotent instead of accumulating duplicates.
 */
export const BulkCreateSignalsSchema = z.object({
  signals:         z.array(CreateSignalSchema).min(1).max(2000),
  replaceExisting: z.boolean().default(false),
  sessionKey:      z.string().min(1).optional(),
});

export const ListSignalsQuerySchema = z.object({
  sessionKey:   z.string().optional(),
  priority:     z.enum(['high', 'med', 'low']).optional(),
  lap:          z.coerce.number().int().nonnegative().optional(),
  driverNumber: z.coerce.number().int().positive().optional(),
  teamId:       z.string().optional(),
  scopeKind:    z.enum(['session', 'driver', 'team']).optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateSignalInput        = z.infer<typeof CreateSignalSchema>;
export type UpdateSignalInput        = z.infer<typeof UpdateSignalSchema>;
export type BulkCreateSignalsInput   = z.infer<typeof BulkCreateSignalsSchema>;
export type ListSignalsQueryInput    = z.infer<typeof ListSignalsQuerySchema>;
