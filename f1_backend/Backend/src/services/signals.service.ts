import { Signal, ISignal } from '../models/Signal.model';

export interface ListSignalsOptions {
  sessionKey?:   string;
  priority?:     'high' | 'med' | 'low';
  lap?:          number;
  driverNumber?: number;
  teamId?:       string;
  scopeKind?:    'session' | 'driver' | 'team';
  page?:         number;
  limit?:        number;
}

/**
 * Paginated list of active signals with optional filters.
 */
export async function listSignals(opts: ListSignalsOptions) {
  const { sessionKey, priority, lap, driverNumber, teamId, scopeKind, page = 1, limit = 20 } = opts;

  const filter: Record<string, unknown> = { isActive: true };
  if (sessionKey)        filter.sessionKey   = sessionKey;
  if (priority)          filter.priority     = priority;
  if (lap !== undefined) filter.lap          = lap;
  if (driverNumber !== undefined) filter.driverNumber = driverNumber;
  if (teamId)            filter.teamId       = teamId;
  if (scopeKind)         filter.scopeKind    = scopeKind;

  const skip = (page - 1) * limit;
  const [signals, total] = await Promise.all([
    Signal.find(filter)
      .sort({ lap: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Signal.countDocuments(filter),
  ]);

  return { signals, total, page, pages: Math.ceil(total / limit) };
}

export async function getSignalById(id: string) {
  return Signal.findById(id).lean();
}

export async function createSignal(data: Partial<ISignal>) {
  return Signal.create(data);
}

/**
 * Insert many signals in one round trip. When `replaceExisting` is set, prior
 * AI-generated signals for `sessionKey` are removed first so re-running the
 * telemetry pipeline replaces rather than duplicates its output.
 */
export async function bulkCreateSignals(
  signals: Array<Partial<ISignal>>,
  opts: { replaceExisting?: boolean; sessionKey?: string } = {}
) {
  const sessionKey = opts.sessionKey ?? signals[0]?.sessionKey;
  if (opts.replaceExisting && sessionKey) {
    await Signal.deleteMany({ sessionKey, aiGenerated: true });
  }
  const inserted = await Signal.insertMany(signals, { ordered: false });
  return { inserted: inserted.length, ids: inserted.map((d) => String(d._id)) };
}

export async function updateSignal(id: string, data: Partial<ISignal>) {
  return Signal.findByIdAndUpdate(
    id,
    { $set: data },
    { new: true, runValidators: true }
  );
}

/**
 * Soft-delete: set isActive = false.
 */
export async function deactivateSignal(id: string) {
  return Signal.findByIdAndUpdate(
    id,
    { $set: { isActive: false } },
    { new: true }
  );
}
