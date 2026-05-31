import { z } from 'zod';

const SeriesSchema = z.object({
  id:           z.string().min(1),
  label:        z.string(),
  driverNumber: z.number().optional(),
  color:        z.string().default('#171717'),
  dataKey:      z.string(),
  strokeDash:   z.string().optional(),
  type:         z.enum(['actual', 'projected', 'reference']).default('actual'),
});

const AnnotationSchema = z.object({
  type:    z.enum(['point', 'band', 'line', 'label']),
  xValue:  z.union([z.number(), z.string()]).optional(),
  xRange:  z.tuple([z.union([z.number(), z.string()]), z.union([z.number(), z.string()])]).optional(),
  color:   z.string().default('#E10600'),
  label:   z.string(),
  meta:    z.record(z.unknown()).optional(),
});

const SvgPathSchema = z.object({
  d:           z.string(),
  stroke:      z.string().default('#171717'),
  strokeWidth: z.number().default(1),
  fill:        z.string().default('none'),
});

const AxisSchema = z.object({
  key:    z.string(),
  label:  z.string(),
  unit:   z.string().default(''),
  domain: z.tuple([z.number(), z.number()]).optional(),
});

export const CreateGraphSchema = z.object({
  type: z.enum([
    'line', 'multi_line', 'comparison', 'bar', 'bar_grouped',
    'sparkline', 'scatter', 'area', 'projection',
    'tire_map', 'heat_map', 'annotated_svg',
  ]),
  title:      z.string().optional(),
  subtitle:   z.string().optional(),
  storyId:    z.string().optional(),
  sessionKey: z.string().optional(),
  driverNumber: z.number().int().positive().nullable().optional(),
  teamId:       z.string().nullable().optional(),
  teamName:     z.string().nullable().optional(),
  scopeKind:    z.enum(['session', 'driver', 'team']).optional(),
  xAxis:      AxisSchema.optional(),
  yAxis:      AxisSchema.optional(),
  series:     z.array(SeriesSchema).default([]),
  dataPoints: z.array(z.record(z.unknown())).default([]),
  projectionConfig: z.object({
    method:         z.enum(['linear', 'polynomial', 'exponential']),
    historicalLaps: z.number().int().positive(),
    forecastLaps:   z.number().int().positive(),
    confidenceBand: z.boolean().default(true),
  }).optional(),
  annotations:   z.array(AnnotationSchema).default([]),
  svgPaths:      z.array(SvgPathSchema).default([]),
  generatedByAI: z.boolean().default(false),
  aiRunId:       z.string().optional(),
});

export const UpdateGraphSchema = CreateGraphSchema.partial();

/**
 * Bulk create. `replaceExisting` clears prior AI-generated graph specs for the
 * sessionKey before inserting, so re-running the pipeline doesn't accumulate
 * duplicate charts.
 */
export const BulkCreateGraphsSchema = z.object({
  graphs:          z.array(CreateGraphSchema).min(1).max(2000),
  replaceExisting: z.boolean().default(false),
  sessionKey:      z.string().min(1).optional(),
});

export const ListGraphsQuerySchema = z.object({
  storyId:      z.string().optional(),
  sessionKey:   z.string().optional(),
  driverNumber: z.coerce.number().int().positive().optional(),
  teamId:       z.string().optional(),
  scopeKind:    z.enum(['session', 'driver', 'team']).optional(),
  page:         z.coerce.number().int().positive().default(1),
  limit:        z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateGraphInput      = z.infer<typeof CreateGraphSchema>;
export type UpdateGraphInput      = z.infer<typeof UpdateGraphSchema>;
export type BulkCreateGraphsInput = z.infer<typeof BulkCreateGraphsSchema>;
export type ListGraphsQueryInput  = z.infer<typeof ListGraphsQuerySchema>;
