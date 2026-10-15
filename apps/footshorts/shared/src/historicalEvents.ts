// Football-seasons book events (vizmaya-data/football-seasons, Layer 2) and their
// fact-check state. Private admin storage: never write these rows to fixtures,
// entities, recaps or any consumer-facing table.
export const HISTORY_EVENTS_TABLE = 'admin_historical_events';

export const HISTORY_VERDICTS = ['yes', 'fixed', 'no'] as const;
export type HistoryVerdict = (typeof HISTORY_VERDICTS)[number];

export const HISTORY_EVENT_TYPES: Record<string, string> = {
  manager_change: 'Manager change', transfer: 'Transfer', match: 'Match', record: 'Record',
  controversy: 'Controversy', suspension: 'Suspension', injury: 'Injury', ownership: 'Ownership',
  finance: 'Finance', award: 'Award', international: 'International', off_field: 'Off the pitch', other: 'Other',
};

/** Columns that come from events.csv. A push overwrites only these, so the
 * fact-check state (verified, notes, checked_*) made in the admin survives. */
export const HISTORY_EVENT_CONTENT_COLUMNS = ['season', 'date', 'month', 'type', 'importance', 'competition', 'teams',
  'team_names', 'people', 'summary', 'fee', 'source_url', 'origin', 'source_page', 'evidence'] as const;

export interface HistoryEvent {
  id: string;
  season: string;
  date: string;
  month: string;
  type: string;
  importance: number;
  competition: string;
  teams: string;
  team_names: string;
  people: string;
  summary: string;
  fee: string;
  source_url: string;
  origin: string;
  source_page: string;
  evidence: string;
  verified: '' | HistoryVerdict;
  notes: string;
  checked_by: string | null;
  checked_at: string | null;
}

export function isHistoryVerdict(v: unknown): v is '' | HistoryVerdict {
  return v === '' || (HISTORY_VERDICTS as readonly unknown[]).includes(v);
}

/** "2003-04" — the season label events.csv and the table use. */
export function isSeasonLabel(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);
}
