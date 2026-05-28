# Coke Studio Pakistan — songs.csv ingest notes

Source: cached plain-text render of
https://en.wikipedia.org/wiki/List_of_Coke_Studio_Pakistan_episodes
(fetched 2026-05; 584-line tool-results dump).

## Totals

- **Total rows written: 352** (excluding header)
- Schema: `song_id,title,title_native,season,episode,track_in_episode,release_date,duration_seconds,artists,lyricists,composers,producer,youtube_url,is_instrumental,is_cover,original_artist,notes`

## Per-season counts

| Season | Rows | Episodes covered | Notes |
|--------|------|------------------|-------|
| 1      | 26   | 4 | Episode 4 includes 3 rebroadcast songs (kept; flagged in notes) |
| 2      | 27   | 5 | Each episode given a sub-title (Individuality, Harmony, Equality, Spirit, Unity) — stored in `notes` |
| 3      | 25   | 5 | Episode sub-titles Reason/Will/Conception/Form/Realisation stored in `notes` |
| 4      | 22   | 5 | E5 only has 2 songs in the page (Beero Binjaaro, Mori Bangri) — appears incomplete on Wikipedia |
| 5      | 25   | 5 | "Seher" flagged is_instrumental |
| 6      | 20   | 5 + 2 openers | Used `e00` for the two season-opener tracks (Jogi, Laili Jaan) |
| 7      | 28   | 7 | Three Usman Riaz / Ustad Raees Khan tracks flagged is_instrumental |
| 8      | 29   | 7 + 1 opener | "Sohni Dharti" stored at `e00` |
| 9      | 32   | 7 + 2 openers | Finale (E7) has 6 songs; openers Zalima Coca Cola Pila De + Aye Rah-E-Haq stored at `e00` |
| 10     | 29   | 7 + 1 opener | National Anthem stored at `e00` |
| 11     | 31   | 9 + 1 opener | Episode sub-titles (Naaz, Zeenat, Rung, Gulistan, Mauj, Zamana, Sahil, Jashan, Aftab) in `notes`; Aurangzeb flagged instrumental |
| 12     | 21   | 6 + 1 opener | "Wohi Khuda Hai" stored at `e00`; Hairaan Hua kept (per page, despite Abida Parveen copyright takedown) |
| 13     | 12   | 4 | This is **Coke Studio 2020** on Wikipedia. Producer set to Rohail Hyatt — see producer-mapping note below. |
| 14     | 14   | 4 + 2 openers | Shuru Karein + Tu Jhoom stored at `e00` |
| 15     | 11   | 4 | All 11 released songs (numbered 1–11 across 4 episodes) |

## Producer mapping (verified against page)

- S1–S6 → Rohail Hyatt (confirmed)
- S7–S11 → Strings (confirmed; Strings credited as music director on opener/anthem tracks)
- S12 → Rohail Hyatt (confirmed; his return is mentioned in song-level music director column, e.g. "Mujahid Hussain & Rohail Hyatt")
- **S13 (= "Coke Studio 2020") → Rohail Hyatt** (NOT "Explorer"). The research-plan note conflating S13 with Coke Studio Explorer is **incorrect per Wikipedia**. Coke Studio Explorer was a separate 2018 mini-series of 5 songs (Pareek, Faqeera, Naseebaya, Tere Bin Soona, Ha Gulo). Those Explorer songs are NOT included in this seed CSV — they're outside the numbered-season schema and the spec didn't call for them.
- S14–S15 → Xulfi (confirmed; "Xulfi" credited as music director / composer across nearly every track)

## Specials NOT included

The page also lists these special one-offs which were intentionally skipped (out of scope for the seed CSV):
- Coke Studio Special (web blog, 3 tracks, 2010) — Rohail Hyatt
- Phir Se Game Utha Dain (2015, cricket) — Strings, cover of Matt Sloggett
- Hum Aik Hain (2019) — Xulfi
- Asma-ul-Husna / The 99 Names (2020 Ramadan) — Xulfi
- Ao Ehad Karain (2021 Pakistan Day) — Ali Hamza
- Cricket Khidaiye (2021) — Talal Qureshi
- Coke Studio Explorer (2018, 5 songs) — separate Explorer series, distinct from S13

If a future ingest wants them, they're available in the same source dump at lines ~542-582.

## Field conventions / gotchas for downstream consumers

1. `song_id` format: `cs_s{NN}_e{NN}_t{NN}`. Zero-padded throughout, e.g. `cs_s07_e03_t02`.
2. Season-opener / pre-episode tracks: stored with `episode` blank and `track_in_episode` = 1..N sequencing among openers. `song_id` uses `e00`. The CSV `episode` column is left empty (per spec for non-episodic) for these opener rows. Note: regular episode rows always have both `episode` and `track_in_episode` populated.
3. Wikipedia frequently lists release dates per-episode, not per-song. The episode date has been applied to every song in that episode. Exception: S14 lists per-song release dates and those are preserved as-is.
4. `lyricists` and `composers` are **left blank everywhere** per spec, even though many seasons (S2 onwards) have lyricist data and S9+ has composer data on the page. A future enrichment pass can backfill these from the same source dump.
5. `artists` cells containing commas are CSV-quoted. Pipe-separation was specified, but the page already uses comma/ampersand separators inside multi-artist credits — we preserved the original string verbatim (quoted) rather than re-parsing into pipes, because some "and" groupings are intentional band names (e.g., "Zeb and Haniya", "Ali Pervez Mehdi & Meesha Shafi"). Downstream code should treat the artists field as a human-readable string until a normalization pass is done.
6. `is_instrumental=true` set for: Flute Jam (S1), Baageshri (S4), Seher (S5), Bone Shaker, Descent to the Ocean Floor, Hans Dhuni (S7), Aurangzeb (S11).
7. `is_cover` / `original_artist` left empty everywhere — the episode list doesn't flag covers; this is a known gap (e.g., Tajdar-e-Haram is a Sabri Brothers cover but the page doesn't say so).
8. `youtube_url` and `duration_seconds` are intentionally empty across all rows. Plan: a separate enrichment job hits the YouTube Data API by `(title, season)` lookup.
9. Non-ASCII handling: Turkish character names (Sumru Ağıryürüyen) were transliterated to ASCII (Agiryuruyen) to avoid UTF-8 surprises in shell-piped consumers. If a richer rendering is desired, restore from source.
10. Em-dashes (`–`) in titles like "Sawaal – Kande Utte" were normalized to ASCII hyphen (`-`).

## Source-page incompleteness flags

- **S4 E5** appears truncated on Wikipedia (only 2 songs vs. typical 5).
- **S15** has no "season opener" row on the page; the CSV reflects this (starts directly at E1 T1).
- **S6 E1** is listed with only 3 songs on the page; possibly incomplete but matches source.
