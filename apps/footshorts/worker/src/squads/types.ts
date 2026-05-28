/**
 * Shared types for the WC26 squad ingest pipeline.
 *
 * Each source adapter (wikipedia / press-release / manual) produces
 * `RawSquadEntry[]`. The processor takes that list, upserts entities +
 * profiles + squad rows, and resolves club names to existing team entities.
 */

export type SquadSource = 'wikipedia' | 'press_release' | 'manual';

export type SquadPosition = 'GK' | 'DF' | 'MF' | 'FW';

export type SquadRole = 'captain' | 'vice_captain' | null;

export type RawSquadEntry = {
  name: string;
  jersey?: number;
  position?: SquadPosition;
  date_of_birth?: string; // ISO YYYY-MM-DD
  club_name_raw?: string;
  photo_url?: string;
  role?: SquadRole;
};

export type ProcessResult = {
  country_code: string;
  source: SquadSource;
  players_seen: number;
  players_inserted: number;
  players_updated: number;
  clubs_matched: number;
  clubs_unmatched: number;
  unmatched_club_names: string[];
};
