import { z } from 'zod';

const AngleSchema = z.object({
  sessionKey:          z.string().min(1),
  runId:               z.string().nullable().optional(),
  scopeKind:           z.enum(['driver', 'team']),
  driverNumber:        z.number().int().positive().nullable().default(null),
  teamId:              z.string().nullable().optional(),
  teamName:            z.string().nullable().optional(),
  title:               z.string().min(1).max(300),
  focus:               z.string().min(1).max(2000),
  rationale:           z.string().max(2000).default(''),
  priority:            z.enum(['high', 'med', 'low']).default('med'),
  // Inclusive lap range the angle covers; emitted by the AI worker's Angle Scout
  // so downstream crews work with a tight slice instead of the full session.
  // Optional + refined so a malformed window is rejected up front rather than
  // silently degrading to full-session reads.
  lapWindow:           z
    .object({
      start: z.number().int().positive(),
      end:   z.number().int().positive(),
    })
    .refine((w) => w.end >= w.start, { message: 'lapWindow.end must be >= lapWindow.start' })
    .nullable()
    .optional(),
  supportingSignalIds: z.array(z.string()).default([]),
  aiGenerated:         z.boolean().default(true),
});

/** Bulk-create from the AI worker (one POST per scope). */
export const CreateAnglesSchema = z.object({
  angles: z.array(AngleSchema).min(1),
});

export const UpdateAngleSchema = z.object({
  title:    z.string().min(1).max(300).optional(),
  focus:    z.string().min(1).max(2000).optional(),
  priority: z.enum(['high', 'med', 'low']).optional(),
  status:   z.enum(['proposed', 'selected', 'rejected', 'generated']).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No fields to update' });

export const BulkSelectSchema = z.object({
  ids:    z.array(z.string().min(1)).min(1),
  status: z.enum(['selected', 'rejected', 'proposed']),
});

export const ListAnglesQuerySchema = z.object({
  sessionKey:   z.string().optional(),
  scopeKind:    z.enum(['driver', 'team']).optional(),
  driverNumber: z.coerce.number().int().positive().optional(),
  teamId:       z.string().optional(),
  status:       z.enum(['proposed', 'selected', 'rejected', 'generated']).optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().min(1).max(500).default(200),
});

export type CreateAnglesInput     = z.infer<typeof CreateAnglesSchema>;
export type UpdateAngleInput      = z.infer<typeof UpdateAngleSchema>;
export type BulkSelectInput       = z.infer<typeof BulkSelectSchema>;
export type ListAnglesQueryInput  = z.infer<typeof ListAnglesQuerySchema>;
