/**
 * Backfill `scope` + `parentStoryId` on existing Story docs.
 *
 * Default scope for pre-migration docs is `{ kind: 'session' }`, which matches
 * the old behaviour where every story was session-wide. Idempotent — only
 * touches docs missing the `scope` field.
 *
 * Run: npx tsx Backend/src/scripts/migrateStoryScope.ts
 */

import mongoose from 'mongoose';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { Story } from '../models/Story.model';

async function main() {
  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to MongoDB');

  const missingScope = await Story.countDocuments({ scope: { $exists: false } });
  logger.info(`Stories missing scope: ${missingScope}`);

  const r1 = await Story.updateMany(
    { scope: { $exists: false } },
    { $set: { scope: { kind: 'session' } } },
  );
  logger.info(`Set default session scope on ${r1.modifiedCount} stories`);

  const r2 = await Story.updateMany(
    { parentStoryId: { $exists: false } },
    { $set: { parentStoryId: null } },
  );
  logger.info(`Set parentStoryId=null on ${r2.modifiedCount} stories`);

  await mongoose.disconnect();
  logger.info('Done');
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
