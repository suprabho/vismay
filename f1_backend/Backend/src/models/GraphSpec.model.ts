import mongoose, { Schema, Document } from 'mongoose';

export type GraphType =
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

export type GraphScopeKind = 'session' | 'driver' | 'team';

export interface IGraphSpec extends Document {
  type:       GraphType;
  title:      string | null;
  subtitle:   string | null;
  storyId:    mongoose.Types.ObjectId | null;
  sessionKey: string | null;
  driverNumber: number | null;
  teamId:       string | null;
  teamName:     string | null;
  scopeKind:    GraphScopeKind;
  xAxis:      { key: string; label: string; unit: string } | null;
  yAxis:      { key: string; label: string; unit: string; domain: number[] | null } | null;
  series:     Array<{
    id:           string;
    label:        string;
    driverNumber: number | null;
    color:        string;
    dataKey:      string;
    strokeDash:   string | null;
    type:         'actual' | 'projected' | 'reference';
  }>;
  dataPoints:       Record<string, unknown>[];
  projectionConfig: {
    method:         'linear' | 'polynomial' | 'exponential';
    historicalLaps: number;
    forecastLaps:   number;
    confidenceBand: boolean;
  } | null;
  annotations: Array<{
    type:   'point' | 'band' | 'line' | 'label';
    xValue: unknown;
    xRange: unknown[] | null;
    color:  string;
    label:  string;
  }>;
  svgPaths: Array<{
    d:           string;
    stroke:      string;
    strokeWidth: number;
    fill:        string;
  }>;
  generatedByAI: boolean;
  aiRunId:       mongoose.Types.ObjectId | null;
  createdAt:     Date;
  updatedAt:     Date;
}

const GraphSpecSchema = new Schema<IGraphSpec>(
  {
    type: {
      type:     String,
      required: true,
      enum: [
        'line', 'multi_line', 'comparison', 'bar', 'bar_grouped',
        'sparkline', 'scatter', 'area', 'projection',
        'tire_map', 'heat_map', 'annotated_svg',
      ],
    },
    title:      { type: String, default: null },
    subtitle:   { type: String, default: null },
    storyId:    { type: Schema.Types.ObjectId, ref: 'Story',     default: null },
    sessionKey: { type: String, default: null },
    driverNumber: { type: Number, default: null },
    teamId:       { type: String, default: null },
    teamName:     { type: String, default: null },
    scopeKind:    { type: String, enum: ['session', 'driver', 'team'], default: 'session' },
    xAxis: {
      key:   { type: String },
      label: { type: String },
      unit:  { type: String },
      _id:   false,
    },
    yAxis: {
      key:    { type: String },
      label:  { type: String },
      unit:   { type: String },
      domain: [Number],
      _id:    false,
    },
    series: [
      {
        id:           { type: String, required: true },
        label:        { type: String },
        driverNumber: { type: Number, default: null },
        color:        { type: String, required: true },
        dataKey:      { type: String, required: true },
        strokeDash:   { type: String, default: null },
        type:         { type: String, enum: ['actual', 'projected', 'reference'] },
        _id:          false,
      },
    ],
    dataPoints:  { type: Schema.Types.Mixed, default: [] },
    projectionConfig: {
      method:         { type: String, enum: ['linear', 'polynomial', 'exponential'] },
      historicalLaps: Number,
      forecastLaps:   Number,
      confidenceBand: Boolean,
      _id:            false,
    },
    annotations: [
      {
        type:   { type: String, enum: ['point', 'band', 'line', 'label'] },
        xValue: Schema.Types.Mixed,
        xRange: [Schema.Types.Mixed],
        color:  String,
        label:  String,
        _id:    false,
      },
    ],
    svgPaths: [
      {
        d:           String,
        stroke:      String,
        strokeWidth: Number,
        fill:        String,
        _id:         false,
      },
    ],
    generatedByAI: { type: Boolean, default: false },
    aiRunId:       { type: Schema.Types.ObjectId, ref: 'StoryRun', default: null },
  },
  { timestamps: true, collection: 'graph_specs' }
);

GraphSpecSchema.index({ storyId: 1 });
GraphSpecSchema.index({ sessionKey: 1 });
GraphSpecSchema.index({ sessionKey: 1, driverNumber: 1 });
GraphSpecSchema.index({ sessionKey: 1, teamId: 1 });
GraphSpecSchema.index({ sessionKey: 1, scopeKind: 1 });

export const GraphSpec = mongoose.model<IGraphSpec>('GraphSpec', GraphSpecSchema);
