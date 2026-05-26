/**
 * Common interface for lyric sources used by scripts/coke-studio/fetch-lyrics.ts.
 *
 * Each source returns at most one LyricsCandidate per song. The orchestrator
 * fans out across all sources in parallel, scores the survivors, and upserts
 * the winner into coke_studio_song_lyrics.
 */

export interface SongRow {
  song_id: string
  title: string
  season: number
  episode: number | null
  track_in_episode: number
  artists: string | null
  notes: string | null
}

export type SourceName =
  | 'genius'
  | 'youtube'
  | 'lyricstranslate'
  | 'wayback'
  | 'manual'

export interface LyricsCandidate {
  source: SourceName
  source_url: string
  source_id: string | null
  raw_text: string
  /** Heuristic — true if the text contains a meaningful chunk of
   *  Arabic/Devanagari script (i.e. native-script lyrics, not just Roman). */
  has_native_script: boolean
  /** Heuristic — true if the text appears to contain a parallel English
   *  translation alongside the original (or just English when the song is
   *  in English). */
  has_translation: boolean
  /** Optional side-effect signals: YouTube source backfills these onto
   *  coke_studio_songs after the song's winner is picked. */
  youtube_url?: string
  duration_seconds?: number | null
}

export interface LyricsSource {
  readonly name: SourceName
  /** Returns a candidate or null if the source couldn't find a match.
   *  Throws on transport / parse errors — the orchestrator catches those
   *  per-source so one bad source doesn't kill the whole song. */
  fetch(song: SongRow): Promise<LyricsCandidate | null>
}
