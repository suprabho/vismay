import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as SignalsService from '../services/signals.service';
import {
  CreateSignalInput,
  UpdateSignalInput,
  BulkCreateSignalsInput,
  ListSignalsQueryInput,
} from '../schemas/zod/signals.schema';

/** GET /api/signals */
export const listSignals = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListSignalsQueryInput;
  const result = await SignalsService.listSignals({
    sessionKey:   query.sessionKey,
    priority:     query.priority,
    lap:          query.lap,
    driverNumber: query.driverNumber,
    teamId:       query.teamId,
    scopeKind:    query.scopeKind,
    page:         query.page,
    limit:        query.limit,
  });
  res.json(result);
});

/** GET /api/signals/:id */
export const getSignal = asyncHandler(async (req: Request, res: Response) => {
  const signal = await SignalsService.getSignalById(req.params.id);
  if (!signal) {
    res.status(404).json({ message: 'Signal not found' });
    return;
  }
  res.json(signal);
});

/** POST /api/signals */
export const createSignal = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as CreateSignalInput;
  const signal = await SignalsService.createSignal(data);
  res.status(201).json(signal);
});

/** POST /api/signals/bulk */
export const bulkCreateSignals = asyncHandler(async (req: Request, res: Response) => {
  const { signals, replaceExisting, sessionKey } = req.body as BulkCreateSignalsInput;
  const result = await SignalsService.bulkCreateSignals(signals, { replaceExisting, sessionKey });
  res.status(201).json(result);
});

/** PATCH /api/signals/:id */
export const updateSignal = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as UpdateSignalInput;
  const signal = await SignalsService.updateSignal(req.params.id, data);
  if (!signal) {
    res.status(404).json({ message: 'Signal not found' });
    return;
  }
  res.json(signal);
});

/** DELETE /api/signals/:id */
export const deactivateSignal = asyncHandler(async (req: Request, res: Response) => {
  const signal = await SignalsService.deactivateSignal(req.params.id);
  if (!signal) {
    res.status(404).json({ message: 'Signal not found' });
    return;
  }
  res.json({ message: 'Signal deactivated' });
});
