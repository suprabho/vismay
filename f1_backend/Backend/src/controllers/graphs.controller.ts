import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as GraphsService from '../services/graphs.service';
import { CreateGraphInput, UpdateGraphInput, BulkCreateGraphsInput, ListGraphsQueryInput } from '../schemas/zod/graphs.schema';

export const listGraphs = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListGraphsQueryInput;
  const result = await GraphsService.listGraphs(query);
  res.json(result);
});

export const getGraph = asyncHandler(async (req: Request, res: Response) => {
  const graph = await GraphsService.getGraphById(req.params.id);
  if (!graph) {
    res.status(404).json({ message: 'Graph not found' });
    return;
  }
  res.json(graph);
});

export const createGraph = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as CreateGraphInput;
  const graph = await GraphsService.createGraph(data);
  res.status(201).json(graph);
});

export const bulkCreateGraphs = asyncHandler(async (req: Request, res: Response) => {
  const { graphs, replaceExisting, sessionKey } = req.body as BulkCreateGraphsInput;
  const result = await GraphsService.bulkCreateGraphs(graphs, { replaceExisting, sessionKey });
  res.status(201).json(result);
});

export const updateGraph = asyncHandler(async (req: Request, res: Response) => {
  const data = req.body as UpdateGraphInput;
  const graph = await GraphsService.updateGraph(req.params.id, data);
  if (!graph) {
    res.status(404).json({ message: 'Graph not found' });
    return;
  }
  res.json(graph);
});

export const deleteGraph = asyncHandler(async (req: Request, res: Response) => {
  const graph = await GraphsService.deleteGraph(req.params.id);
  if (!graph) {
    res.status(404).json({ message: 'Graph not found' });
    return;
  }
  res.json({ message: 'Graph deleted' });
});
