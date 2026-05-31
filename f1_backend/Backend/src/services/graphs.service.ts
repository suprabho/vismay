import mongoose from 'mongoose';
import { GraphSpec } from '../models/GraphSpec.model';
import { CreateGraphInput, UpdateGraphInput, ListGraphsQueryInput } from '../schemas/zod/graphs.schema';

export async function listGraphs({ storyId, sessionKey, driverNumber, teamId, scopeKind, page = 1, limit = 20 }: ListGraphsQueryInput) {
  const filter: Record<string, unknown> = {};
  if (storyId)    filter.storyId    = new mongoose.Types.ObjectId(storyId);
  if (sessionKey) filter.sessionKey = sessionKey;
  if (driverNumber !== undefined) filter.driverNumber = driverNumber;
  if (teamId)     filter.teamId     = teamId;
  if (scopeKind)  filter.scopeKind  = scopeKind;

  const skip  = (page - 1) * limit;
  const total = await GraphSpec.countDocuments(filter);
  const graphs = await GraphSpec.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

  return { graphs, total, page, pages: Math.ceil(total / limit) };
}

export async function getGraphById(id: string) {
  return GraphSpec.findById(id).lean();
}

export async function createGraph(data: CreateGraphInput) {
  const doc: Record<string, unknown> = { ...data };
  if (data.storyId) doc.storyId = new mongoose.Types.ObjectId(data.storyId);
  if (data.aiRunId) doc.aiRunId = new mongoose.Types.ObjectId(data.aiRunId);
  const graph = await GraphSpec.create(doc);
  return graph.toObject();
}

/**
 * Insert many graph specs in one round trip. When `replaceExisting` is set,
 * prior AI-generated specs for `sessionKey` are removed first so re-runs replace
 * rather than duplicate charts.
 */
export async function bulkCreateGraphs(
  graphs: CreateGraphInput[],
  opts: { replaceExisting?: boolean; sessionKey?: string } = {}
) {
  const sessionKey = opts.sessionKey ?? graphs[0]?.sessionKey ?? undefined;
  if (opts.replaceExisting && sessionKey) {
    await GraphSpec.deleteMany({ sessionKey, generatedByAI: true });
  }
  const docs = graphs.map((data) => {
    const doc: Record<string, unknown> = { ...data };
    if (data.storyId) doc.storyId = new mongoose.Types.ObjectId(data.storyId);
    if (data.aiRunId) doc.aiRunId = new mongoose.Types.ObjectId(data.aiRunId);
    return doc;
  });
  const inserted = await GraphSpec.insertMany(docs, { ordered: false });
  return { inserted: inserted.length, ids: inserted.map((d) => String(d._id)) };
}

export async function updateGraph(id: string, data: UpdateGraphInput) {
  const update: Record<string, unknown> = { ...data };
  if (data.storyId) update.storyId = new mongoose.Types.ObjectId(data.storyId);
  if (data.aiRunId) update.aiRunId = new mongoose.Types.ObjectId(data.aiRunId);
  return GraphSpec.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
}

export async function deleteGraph(id: string) {
  return GraphSpec.findByIdAndDelete(id).lean();
}
