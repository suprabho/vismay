import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { AnalysisAngle } from '../models/AnalysisAngle.model';
import {
  CreateAnglesInput,
  UpdateAngleInput,
  BulkSelectInput,
  ListAnglesQueryInput,
} from '../schemas/zod/angles.schema';

const toObjectId = (v?: string | null) =>
  v && mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null;

/** GET /api/analysis-angles */
export const listAngles = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListAnglesQueryInput;

  const filter: Record<string, unknown> = {};
  if (query.sessionKey)             filter.sessionKey   = query.sessionKey;
  if (query.scopeKind)              filter.scopeKind    = query.scopeKind;
  if (query.driverNumber !== undefined) filter.driverNumber = query.driverNumber;
  if (query.teamId)                 filter.teamId       = query.teamId;
  if (query.status)                 filter.status       = query.status;

  const skip = (query.page - 1) * query.limit;
  const [angles, total] = await Promise.all([
    AnalysisAngle.find(filter)
      .sort({ priority: 1, createdAt: 1 })
      .skip(skip)
      .limit(query.limit)
      .lean()
      .then(docs => docs.map(d => ({ ...d, id: String(d._id) }))),
    AnalysisAngle.countDocuments(filter),
  ]);

  res.json({ angles, total, page: query.page, pages: Math.ceil(total / query.limit) });
});

/** POST /api/analysis-angles — bulk create (AI worker) */
export const createAngles = asyncHandler(async (req: Request, res: Response) => {
  const { angles } = req.body as CreateAnglesInput;

  const docs = angles.map(a => ({
    ...a,
    runId:               toObjectId(a.runId),
    supportingSignalIds: (a.supportingSignalIds ?? [])
      .map(toObjectId)
      .filter((x): x is mongoose.Types.ObjectId => x !== null),
    status: 'proposed' as const,
  }));

  const created = await AnalysisAngle.insertMany(docs);
  res.status(201).json({ created: created.length, ids: created.map(d => String(d._id)) });
});

/** PATCH /api/analysis-angles/:id */
export const updateAngle = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as UpdateAngleInput;
  const angle = await AnalysisAngle.findByIdAndUpdate(
    req.params.id,
    { $set: data },
    { new: true, runValidators: true }
  );
  if (!angle) {
    res.status(404).json({ message: 'Angle not found' });
    return;
  }
  res.json(angle);
});

/** POST /api/analysis-angles/bulk-select */
export const bulkSelectAngles = asyncHandler(async (req: Request, res: Response) => {
  const { ids, status } = req.body as BulkSelectInput;
  const objectIds = ids.map(toObjectId).filter((x): x is mongoose.Types.ObjectId => x !== null);

  const result = await AnalysisAngle.updateMany(
    { _id: { $in: objectIds } },
    { $set: { status } }
  );
  res.json({ matched: result.matchedCount, modified: result.modifiedCount });
});
