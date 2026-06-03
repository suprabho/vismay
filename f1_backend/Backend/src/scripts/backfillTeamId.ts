/**
 * Backfill `teamId` + `scopeKind` on existing Signal and GraphSpec docs.
 *
 * For each doc with `driverNumber != null`, join TelemetrySession.drivers to
 * resolve the driver's teamId/teamName, then set:
 *   - teamId, teamName
 *   - scopeKind = 'driver'  (since the doc was already driver-tagged)
 *
 * Docs without driverNumber get scopeKind = 'session'.
 *
 * Run: npx tsx Backend/src/scripts/backfillTeamId.ts
 */

import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { Signal } from '../models/Signal.model';
import { GraphSpec } from '../models/GraphSpec.model';
import { TelemetrySession } from '../models/TelemetrySession.model';

interface DriverLite { driverNumber: number; teamId?: string; teamName?: string }

async function buildDriverMap(sessionKey: string): Promise<Map<number, DriverLite>> {
  const sess = await TelemetrySession
    .findOne({ sessionKey })
    .select('drivers')
    .lean<{ drivers?: DriverLite[] }>();
  const m = new Map<number, DriverLite>();
  for (const d of sess?.drivers ?? []) {
    if (d.driverNumber != null) m.set(d.driverNumber, d);
  }
  return m;
}

async function backfillCollection(model: typeof Signal | typeof GraphSpec, name: string) {
  const sessions = await model.distinct('sessionKey', { sessionKey: { $ne: null } });
  logger.info(`[${name}] backfilling across ${sessions.length} sessions`);

  for (const sessionKey of sessions) {
    if (!sessionKey) continue;
    const map = await buildDriverMap(sessionKey);
    if (map.size === 0) continue;

    // driver-scoped
    let driverUpdates = 0;
    for (const [dn, d] of map) {
      const r = await model.updateMany(
        { sessionKey, driverNumber: dn, $or: [{ teamId: { $exists: false } }, { teamId: null }] },
        { $set: { teamId: d.teamId ?? null, teamName: d.teamName ?? null, scopeKind: 'driver' } },
      );
      driverUpdates += r.modifiedCount;
    }

    // session-scoped (no driver)
    const r2 = await model.updateMany(
      { sessionKey, driverNumber: null, scopeKind: { $exists: false } },
      { $set: { scopeKind: 'session' } },
    );

    logger.info(`[${name}] ${sessionKey} — driver:${driverUpdates} session:${r2.modifiedCount}`);
  }
}

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to MongoDB');

  await backfillCollection(Signal,    'signals');
  await backfillCollection(GraphSpec, 'graph_specs');

  await mongoose.disconnect();
  logger.info('Done');
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
