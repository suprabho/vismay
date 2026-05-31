import mongoose from 'mongoose';
import { StoryRun, RunStatus, RunPipeline, RunScope, RunStage } from '../models/StoryRun.model';

interface CreateRunInput {
  sessionKey: string;
  pipeline: RunPipeline;
  stage?: RunStage;
  storyId?: string;
  triggeredBy?: string;
  scopesRequested?: RunScope[];
}

interface ListRunsFilters {
  status?: RunStatus;
  pipeline?: RunPipeline;
  page?: number;
  limit?: number;
}

const RUN_ENRICHMENT_STAGES: mongoose.PipelineStage[] = [
  {
    $lookup: {
      from:         'users',
      localField:   'triggeredBy',
      foreignField: '_id',
      as:           'triggeredBy',
      pipeline:     [{ $project: { _id: 1, displayName: 1, email: 1 } }],
    },
  },
  { $unwind: { path: '$triggeredBy', preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from:         'telemetry_sessions',
      localField:   'sessionKey',
      foreignField: 'sessionKey',
      as:           '_session',
      pipeline:     [{ $project: { _id: 0, telemetryStatus: 1, telemetryError: 1 } }],
    },
  },
  {
    $addFields: {
      sessionTelemetryStatus: { $arrayElemAt: ['$_session.telemetryStatus', 0] },
      sessionTelemetryError:  { $arrayElemAt: ['$_session.telemetryError',  0] },
      durationMs: {
        $cond: [
          { $and: ['$startedAt', '$completedAt'] },
          { $subtract: ['$completedAt', '$startedAt'] },
          null,
        ],
      },
    },
  },
  { $project: { _session: 0 } },
];

export const storyRunService = {
  async listRuns({ status, pipeline, page = 1, limit = 20 }: ListRunsFilters) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage  = Math.max(1, page);
    const skip      = (safePage - 1) * safeLimit;

    const match: Record<string, unknown> = {};
    if (status)   match.status   = status;
    if (pipeline) match.pipeline = pipeline;

    const [runs, total] = await Promise.all([
      StoryRun.aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: safeLimit },
        { $project: { logs: 0 } },
        ...RUN_ENRICHMENT_STAGES,
      ]),
      StoryRun.countDocuments(match),
    ]);

    return { runs, total, page: safePage, pages: Math.ceil(total / safeLimit) };
  },

  async getRun(id: string) {
    const [run] = await StoryRun.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id) } },
      ...RUN_ENRICHMENT_STAGES,
    ]);
    return run ?? null;
  },

  async createRun({ sessionKey, pipeline, stage, storyId, triggeredBy, scopesRequested }: CreateRunInput) {
    const run = await StoryRun.create({
      sessionKey,
      pipeline,
      stage: stage ?? null,
      status: 'queued',
      scopesRequested: scopesRequested ?? ['session'],
      storyId:     storyId     ? new mongoose.Types.ObjectId(storyId)     : null,
      triggeredBy: triggeredBy ? new mongoose.Types.ObjectId(triggeredBy) : null,
      logs: [],
      outputRef: {
        storyId:        storyId ? new mongoose.Types.ObjectId(storyId) : null,
        storyIds:       storyId ? [new mongoose.Types.ObjectId(storyId)] : [],
        graphIds:       [],
        signalIds:      [],
        scopeBreakdown: {
          sessionStoryId: storyId ? new mongoose.Types.ObjectId(storyId) : null,
          driverStoryIds: {},
          teamStoryIds:   {},
        },
      },
    });
    return run;
  },

  async appendLog(id: string, line: string) {
    return StoryRun.findByIdAndUpdate(
      id,
      { $push: { logs: line } },
      { new: true }
    );
  },

  async updateStatus(id: string, status: RunStatus, error?: string) {
    const update: Record<string, unknown> = { status };
    if (status === 'running')   update.startedAt   = new Date();
    if (status === 'done' || status === 'failed') update.completedAt = new Date();
    if (error)                  update.error        = error;
    return StoryRun.findByIdAndUpdate(id, update, { new: true });
  },

  async deleteRun(id: string) {
    return StoryRun.findByIdAndDelete(id);
  },
};
