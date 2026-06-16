/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Page = 'magazine' | 'race' | 'signals' | 'stories' | 'story-detail' | 'admin';

export type ScopeKind = 'session' | 'driver' | 'team';

export interface StoryScope {
  kind: ScopeKind;
  driverNumber?: number | null;
  teamId?: string | null;
  teamName?: string | null;
}

export interface Signal {
  id: string;
  lap: number;
  location: string;
  priority: 'high' | 'med' | 'low';
  title: string;
  meaning: string;
  implication: string;
  driverNumber: number | null;
  teamId?: string | null;
  teamName?: string | null;
  scopeKind?: ScopeKind;
  telemetryFields?: {
    label: string;
    value: string;
    color: string;
    percentage?: number;
  }[];
}

export interface Article {
  id: string;
  category: string;
  title: string;
  description: string;
  content: string[];
  readTime: string;
  image: string;
  date: string;
}

// ── Graph Framework ─────────────────────────────────────────────────────────

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
  meta?: Record<string, unknown>;
}

export interface GraphSpec {
  id: string;
  type:
    | 'line'
    | 'multi_line'
    | 'comparison'
    | 'bar'
    | 'bar_grouped'
    | 'sparkline'
    | 'scatter'
    | 'area'
    | 'projection'
    | 'tire_map'
    | 'heat_map'
    | 'annotated_svg';
  title?: string;
  subtitle?: string;
  storyId?: string;
  sessionKey?: string;
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
  createdAt?: string;
}

// ── Story Framework ─────────────────────────────────────────────────────────

export type TelemetryChannel = 'speed' | 'throttle' | 'brake' | 'drs' | 'nGear' | 'rpm';

export interface TelemetryClipMeta {
  sessionKey:         string;
  circuitKey?:        string;
  lapFrom:            number;
  lapTo:              number;
  driverNumbers:      number[];
  focalDriverNumber?: number | null;
  channels?:          TelemetryChannel[];
  mode?:              'fastest_lap' | 'lap_window' | 'stint';
  caption?:           string;
}

export interface StoryContentBlock {
  type: 'paragraph' | 'heading' | 'quote' | 'stat' | 'graph_embed' | 'telemetry_clip';
  text?: string;
  graphId?: string;
  graphSpec?: GraphSpec;
  meta?: Record<string, unknown>;
}

export interface Story {
  id: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  category: string;
  title: string;
  summary: string;
  coverImage: { url: string; alt: string };
  content: StoryContentBlock[];
  readTimeMin: number;
  tags: string[];
  sessionKey?: string;
  scope?: StoryScope;
  parentStoryId?: string | null;
  publishedAt?: string;
  aiGenerated: boolean;
  authorId?: string;
  seo?: { metaTitle?: string; metaDescription?: string };
  createdAt: string;
  updatedAt: string;
}
