import 'server-only'
import { createServiceClient } from '@vismay/content-source/supabase'
import { spreadPackSchema, type SpreadPack } from './spreadPack'
import { BookStoreError } from './store'

const TABLE = 'admin_spread_packs'

/**
 * A season's newest pack per spread. A book opens the same without the table
 * or a pack: the canvas falls back to what the match data can draw. A pack that
 * no longer validates is skipped the same way, so one bad row can't close a book.
 */
export async function listSpreadPacks(seasonStart: number): Promise<Record<string, SpreadPack>> {
  const { data, error } = await createServiceClient().from(TABLE)
    .select('spread_key,pack').eq('season_start', seasonStart).order('built_at', { ascending: false })
  if (error) {
    if (error.message.includes(TABLE) && /does not exist|schema cache|not find/i.test(error.message)) return {}
    throw new BookStoreError(error.message, 500)
  }
  const out: Record<string, SpreadPack> = {}
  for (const row of data ?? []) {
    if (out[row.spread_key]) continue
    const parsed = spreadPackSchema.safeParse(row.pack)
    if (parsed.success) out[row.spread_key] = parsed.data
    else console.warn(`[books] ${row.spread_key}: stored pack does not validate`, parsed.error.issues[0]?.message)
  }
  return out
}
