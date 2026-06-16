import mongoose, { Schema, Document } from 'mongoose';

export type RunStatus   = 'queued' | 'running' | 'done' | 'failed';
export type RunPipeline = 'langraph_telemetry' | 'crew_story' | 'full';
export type RunScope    = 'session' | 'driver' | 'team';
export type RunStage    = 'angles' | 'stories';

export interface IStoryRun extends Document {
  storyId:         mongoose.Types.ObjectId | null;
  sessionKey:      string;
  pipeline:        RunPipeline;
  stage:           RunStage | null;
  scopesRequested: RunScope[];
  status:          RunStatus;
  triggeredBy:     mongoose.Types.ObjectId | null;
  startedAt:       Date | null;
  completedAt:     Date | null;
  logs:            string[];
  error:           string | null;
  outputRef: {
    storyId:   mongoose.Types.ObjectId | null;
    storyIds:  mongoose.Types.ObjectId[];
    graphIds:  mongoose.Types.ObjectId[];
    signalIds: mongoose.Types.ObjectId[];
    scopeBreakdown: {
      sessionStoryId:  mongoose.Types.ObjectId | null;
      driverStoryIds:  Record<string, mongoose.Types.ObjectId>;
      teamStoryIds:    Record<string, mongoose.Types.ObjectId>;
    };
  };
  createdAt: Date;
  updatedAt: Date;
}

const StoryRunSchema = new Schema<IStoryRun>(
  {
    storyId:     { type: Schema.Types.ObjectId, ref: 'Story',   default: null },
    sessionKey:  { type: String, default: '' },
    pipeline:    { type: String, enum: ['langraph_telemetry', 'crew_story', 'full'], required: true },
    stage:       { type: String, enum: ['angles', 'stories'], default: null },
    scopesRequested: {
      type:    [{ type: String, enum: ['session', 'driver', 'team'] }],
      default: ['session'],
    },
    status:      { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
    triggeredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },
    logs:        [{ type: String }],
    error:       { type: String, default: null },
    outputRef: {
      storyId:   { type: Schema.Types.ObjectId, ref: 'Story',    default: null },
      storyIds:  [{ type: Schema.Types.ObjectId, ref: 'Story'    }],
      graphIds:  [{ type: Schema.Types.ObjectId, ref: 'GraphSpec' }],
      signalIds: [{ type: Schema.Types.ObjectId, ref: 'Signal'   }],
      scopeBreakdown: {
        sessionStoryId: { type: Schema.Types.ObjectId, ref: 'Story', default: null },
        driverStoryIds: { type: Schema.Types.Mixed, default: {} },
        teamStoryIds:   { type: Schema.Types.Mixed, default: {} },
        _id:            false,
      },
      _id:       false,
    },
  },
  { timestamps: true, collection: 'story_runs' }
);

StoryRunSchema.index({ sessionKey: 1 });
StoryRunSchema.index({ status: 1 });
StoryRunSchema.index({ triggeredBy: 1 });

export const StoryRun = mongoose.model<IStoryRun>('StoryRun', StoryRunSchema);
