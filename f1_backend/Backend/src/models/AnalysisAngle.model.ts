import mongoose, { Schema, Document } from 'mongoose';

export type AnglePriority  = 'high' | 'med' | 'low';
export type AngleScopeKind = 'driver' | 'team';
export type AngleStatus    = 'proposed' | 'selected' | 'rejected' | 'generated';

export interface IAnalysisAngle extends Document {
  sessionKey:          string;
  runId:               mongoose.Types.ObjectId | null;
  scopeKind:           AngleScopeKind;
  driverNumber:        number | null;
  teamId:              string | null;
  teamName:            string | null;
  title:               string;
  focus:               string;
  rationale:           string;
  priority:            AnglePriority;
  /**
   * Inclusive lap range the angle covers. Emitted by the AI worker's Angle
   * Scout so downstream crews see only the laps relevant to the angle instead
   * of the full session. Optional for backward compatibility with pre-fix
   * angles — when absent, the worker falls back to signal/text inference.
   */
  lapWindow:           { start: number; end: number } | null;
  supportingSignalIds: mongoose.Types.ObjectId[];
  status:              AngleStatus;
  storyId:             mongoose.Types.ObjectId | null;
  aiGenerated:         boolean;
  createdAt:           Date;
  updatedAt:           Date;
}

const AnalysisAngleSchema = new Schema<IAnalysisAngle>(
  {
    sessionKey:          { type: String, required: true },
    runId:               { type: Schema.Types.ObjectId, ref: 'StoryRun', default: null },
    scopeKind:           { type: String, enum: ['driver', 'team'], required: true },
    driverNumber:        { type: Number, default: null },
    teamId:              { type: String, default: null },
    teamName:            { type: String, default: null },
    title:               { type: String, required: true, maxlength: 300 },
    focus:               { type: String, required: true, maxlength: 2000 },
    rationale:           { type: String, default: '', maxlength: 2000 },
    priority:            { type: String, enum: ['high', 'med', 'low'], default: 'med' },
    lapWindow:           {
      type: new Schema(
        { start: { type: Number, required: true }, end: { type: Number, required: true } },
        { _id: false }
      ),
      default: null,
    },
    supportingSignalIds: [{ type: Schema.Types.ObjectId, ref: 'Signal' }],
    status:              { type: String, enum: ['proposed', 'selected', 'rejected', 'generated'], default: 'proposed' },
    storyId:             { type: Schema.Types.ObjectId, ref: 'Story', default: null },
    aiGenerated:         { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: 'analysis_angles',
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = String(ret._id);
        return ret;
      },
    },
  }
);

AnalysisAngleSchema.index({ sessionKey: 1, scopeKind: 1, driverNumber: 1 });
AnalysisAngleSchema.index({ sessionKey: 1, scopeKind: 1, teamId: 1 });
AnalysisAngleSchema.index({ sessionKey: 1, status: 1 });

export const AnalysisAngle = mongoose.model<IAnalysisAngle>('AnalysisAngle', AnalysisAngleSchema);
