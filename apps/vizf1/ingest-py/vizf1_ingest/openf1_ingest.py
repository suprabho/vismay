"""OpenF1-backed session ingest — the fallback path when FastF1's live-timing
source has no data (Cloudflare-blocked runner IP + empty mirror, see README).

Produces the SAME five-table row shapes as ingest.ingest_session, but builds
them directly from OpenF1 REST payloads instead of faking a FastF1 session
object (the extract layer is too pandas/FastF1-shaped to mock credibly).

Contract parity with ingest_session:
  - returns the session_key on success,
  - raises SessionDataUnavailable when OpenF1 has no data either (red run by
    design; the next scheduled run retries for free),
  - raises IngestPhaseFailure when any phase failed after all got their attempt,
  - statuses land in vizf1_telemetry_sessions exactly as before, so the
    latest.py settling logic needs no changes.

Key invariants:
  - gp_name / session_key ALWAYS derive from the FastF1 event schedule (which
    is NOT behind the Cloudflare wall) — never from OpenF1's meeting_name,
    whose spelling drifts ("Barcelona" vs "Spanish", accents). The OpenF1
    session is matched by session type + date proximity instead.
  - the shared time base t0 is the OpenF1 session date_start: lap-telemetry
    sessionTime is seconds since t0 and position frames' t is ms since t0, so
    replay sync works exactly as with FastF1's SessionTime.
  - telemetry lands at its honest ~4 Hz (sample_rate_hz records it; the
    FastF1 path stores 20 Hz) and gap-to-ahead aggregates are null rather
    than fabricated.
  - an OpenF1-derived circuit row (no corners, rotation 0) is written ONLY
    when no row exists for (circuit_key, year) — never over a FastF1 one.
"""
from __future__ import annotations

import datetime as dt
import logging
from bisect import bisect_right
from collections import defaultdict

import fastf1
import pandas as pd

from . import extract
from .ingest import (
    IngestPhaseFailure,
    SessionDataUnavailable,
    _build_lap_rows,
    _mark_status,
)
from .latest import SESSION_NAME_TO_TYPE, _session_start_utc
from .openf1_client import OpenF1Client, parse_openf1_date
from .supabase_sink import SinkUnavailable, SupabaseSink
from .telemetry import _STORE_CHANNELS

logger = logging.getLogger(__name__)

# OpenF1 car_data/location stream at ~3.7 Hz; store the honest nominal rate
# (the FastF1 path stores 20 Hz — consumers key off sample_rate_hz).
OPENF1_SAMPLE_RATE_HZ = 4
_POS_SAMPLE_PERIOD_MS = 250

# How close the OpenF1 session's date_start must be to the FastF1-scheduled
# start to count as the same session.
_MATCH_TOLERANCE = dt.timedelta(hours=2)

# The two sprint-qualifying spellings are the same slot; FastF1 schedules and
# OpenF1 names may disagree on which one a season uses.
_SPRINT_QUALI = {"SQ", "SS"}

# Clean-lap selection for the circuit outline (ported from ingestCircuits.ts).
_MIN_LAP_SECONDS = 45
_MAX_LAP_SECONDS = 180
_CLEAN_LAP_TOLERANCE = 1.07


# ── schedule + session resolution ────────────────────────────────────────────

def _types_match(a: str, b: str) -> bool:
    return a == b or (a in _SPRINT_QUALI and b in _SPRINT_QUALI)


def _resolve_schedule(year: int, gp_name: str, session_type: str) -> dict:
    """Canonical event metadata + scheduled session start from FastF1's schedule."""
    schedule = fastf1.get_event_schedule(year)
    query = gp_name.strip().lower()
    match = None
    for _, ev in schedule.iterrows():
        name = str(ev.get("EventName", "") or "").strip()
        if name and name.lower() == query:
            match = ev
            break
    if match is None:
        for _, ev in schedule.iterrows():
            name = str(ev.get("EventName", "") or "").strip()
            if not name:
                continue
            hay = " ".join(
                str(ev.get(k, "") or "") for k in ("EventName", "Location", "Country")
            ).lower()
            if query and query in hay:
                match = ev
                break
    if match is None:
        raise SessionDataUnavailable(f"No {year} schedule event matches {gp_name!r}")

    start = None
    for slot in range(1, 6):
        nm = match.get(f"Session{slot}")
        stype = SESSION_NAME_TO_TYPE.get(nm.strip()) if isinstance(nm, str) else None
        if stype is not None and _types_match(stype, session_type):
            start = _session_start_utc(match, slot)
            break
    if start is None:
        raise SessionDataUnavailable(
            f"{gp_name} has no scheduled {session_type} session in {year}"
        )
    ts = pd.Timestamp(start)
    ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")

    rnd = match.get("RoundNumber")
    try:
        rnd = int(rnd) if pd.notna(rnd) else None
    except (TypeError, ValueError):
        rnd = None

    return {
        "gp_name":   str(match.get("EventName", "")).strip() or gp_name,
        "round":     rnd,
        "location":  str(match.get("Location", "") or ""),
        "country":   str(match.get("Country", "") or ""),
        "start_utc": ts.to_pydatetime(),
    }


def _match_openf1_session(
    client: OpenF1Client, year: int, session_type: str, scheduled_start: dt.datetime
) -> dict:
    """The OpenF1 /sessions row for the scheduled slot, by type + date proximity."""
    best = None
    best_delta = _MATCH_TOLERANCE
    for s in client.sessions(year):
        if s.get("is_cancelled"):
            continue
        stype = SESSION_NAME_TO_TYPE.get(str(s.get("session_name", "")).strip())
        if stype is None or not _types_match(stype, session_type):
            continue
        raw = s.get("date_start")
        if not raw:
            continue
        delta = abs(parse_openf1_date(raw) - scheduled_start)
        if delta <= best_delta:
            best, best_delta = s, delta
    if best is None:
        raise SessionDataUnavailable(
            f"OpenF1 has no {session_type} session within {_MATCH_TOLERANCE} of "
            f"{scheduled_start.isoformat()} — its data may not be published yet."
        )
    return best


# ── lap windows: the shared clock for bucketing samples ──────────────────────

def _lap_windows(
    laps: list[dict], t0: dt.datetime
) -> dict[int, list[tuple[int, dt.datetime, dt.datetime]]]:
    """Per driver: [(lap_number, start, end)] sorted by lap. Lap n ends where
    lap n+1 starts; the final lap gets its duration + 5s of tail. Missing
    date_start (occasionally lap 1) is synthesized from its neighbors."""
    by_driver: dict[int, list[dict]] = defaultdict(list)
    for lap in laps:
        try:
            dn = int(lap["driver_number"])
            int(lap["lap_number"])
        except (KeyError, TypeError, ValueError):
            continue
        by_driver[dn].append(lap)

    out: dict[int, list[tuple[int, dt.datetime, dt.datetime]]] = {}
    for dn, dl in by_driver.items():
        dl.sort(key=lambda l: int(l["lap_number"]))
        starts: list[dt.datetime | None] = [
            parse_openf1_date(l["date_start"]) if l.get("date_start") else None for l in dl
        ]
        for i, s in enumerate(starts):
            if s is not None:
                continue
            dur = dl[i].get("lap_duration")
            if i + 1 < len(starts) and starts[i + 1] is not None and dur:
                starts[i] = starts[i + 1] - dt.timedelta(seconds=float(dur))
            elif i > 0 and starts[i - 1] is not None:
                prev_dur = dl[i - 1].get("lap_duration") or 120.0
                starts[i] = starts[i - 1] + dt.timedelta(seconds=float(prev_dur))
            else:
                starts[i] = t0
        windows: list[tuple[int, dt.datetime, dt.datetime]] = []
        for i, lap in enumerate(dl):
            start = starts[i]
            if i + 1 < len(dl):
                end = starts[i + 1]
            else:
                end = start + dt.timedelta(seconds=float(lap.get("lap_duration") or 120.0) + 5)
            windows.append((int(lap["lap_number"]), start, end))
        out[dn] = windows
    return out


def _assign_lap(windows: list[tuple[int, dt.datetime, dt.datetime]], sample: dt.datetime) -> int:
    starts = [w[1] for w in windows]
    idx = bisect_right(starts, sample) - 1
    if idx < 0:
        idx = 0
    return windows[idx][0]


# ── Phase 1 builders ─────────────────────────────────────────────────────────

def _standing_for(standings: dict[str, dict], first: str, last: str) -> dict | None:
    """Ergast standings are keyed by Ergast driverId ("max_verstappen",
    "hamilton") which OpenF1 doesn't expose — join heuristically by name."""
    if not standings:
        return None
    f = (first or "").strip().lower().replace(" ", "_")
    l = (last or "").strip().lower().replace(" ", "_")
    for cand in (f"{f}_{l}", l):
        if cand and cand in standings:
            return standings[cand]
    return None


def _build_drivers(of1_drivers: list[dict], standings: dict[str, dict]) -> list[dict]:
    out: list[dict] = []
    for d in of1_drivers:
        try:
            dn = int(d["driver_number"])
        except (KeyError, TypeError, ValueError):
            continue
        colour_raw = str(d.get("team_colour") or "").lstrip("#")
        team_name = str(d.get("team_name") or "")
        standing = _standing_for(standings, d.get("first_name") or "", d.get("last_name") or "")
        out.append({
            "driverNumber":         dn,
            "abbreviation":         str(d.get("name_acronym") or ""),
            "fullName":             str(d.get("full_name") or ""),
            "firstName":            str(d.get("first_name") or ""),
            "lastName":             str(d.get("last_name") or ""),
            "broadcastName":        str(d.get("broadcast_name") or ""),
            "driverId":             "",  # FastF1/Ergast id — not exposed by OpenF1
            "teamName":             team_name,
            "teamId":               extract.slugify(team_name) if team_name else "",
            "teamColour":           f"#{colour_raw}" if colour_raw else "#ffffff",
            "headshotUrl":          d.get("headshot_url") or None,
            "countryCode":          d.get("country_code") or None,
            "championshipPosition": standing.get("position") if standing else None,
            "championshipPoints":   standing.get("points") if standing else None,
            "championshipWins":     standing.get("wins") if standing else None,
        })
    return out


def _build_results(
    results: list[dict], grid: list[dict], drivers: list[dict], session_type: str
) -> list[dict]:
    drivers_by_num = {d["driverNumber"]: d for d in drivers}
    grid_by_num: dict[int, int] = {}
    for g in grid:
        try:
            grid_by_num[int(g["driver_number"])] = int(g["position"])
        except (KeyError, TypeError, ValueError):
            continue

    out: list[dict] = []
    for r in results:
        try:
            dn = int(r["driver_number"])
        except (KeyError, TypeError, ValueError):
            continue
        info = drivers_by_num.get(dn, {})
        position = int(r["position"]) if r.get("position") is not None else None

        # Quali-style sessions carry duration as a [Q1, Q2, Q3] array; races a scalar.
        dur = r.get("duration")
        time_sec = q1 = q2 = q3 = None
        if isinstance(dur, list):
            padded = (dur + [None, None, None])[:3]
            q1, q2, q3 = (float(v) if v is not None else None for v in padded)
        elif isinstance(dur, (int, float)):
            time_sec = float(dur)

        dnf, dns, dsq = bool(r.get("dnf")), bool(r.get("dns")), bool(r.get("dsq"))
        if dsq:
            classified, status = "DSQ", "Disqualified"
        elif dns:
            classified, status = "DNS", "Did not start"
        elif dnf:
            classified, status = "DNF", "DNF"
        else:
            classified = str(position) if position is not None else None
            gap = r.get("gap_to_leader")
            status = gap if isinstance(gap, str) and "lap" in gap.lower() else "Finished"

        out.append({
            "driverNumber":       dn,
            "abbreviation":       info.get("abbreviation", ""),
            "gridPosition":       grid_by_num.get(dn),
            "position":           position,
            "classifiedPosition": classified,
            "points":             float(r.get("points") or 0.0),
            "status":             status,
            "dnf":                dnf or dns or dsq,
            "dnfReason":          status if (dnf or dns or dsq) else None,
            "timeSec":            time_sec,
            "laps":               int(r["number_of_laps"]) if r.get("number_of_laps") is not None else None,
            "q1TimeSec":          q1,
            "q2TimeSec":          q2,
            "q3TimeSec":          q3,
            "headshotUrl":        info.get("headshotUrl"),
            "countryCode":        info.get("countryCode"),
        })
    out.sort(key=lambda r: (r["position"] is None, r["position"]))
    return out


def _pit_lookup(pits: list[dict]) -> dict[tuple[int, int], dict]:
    out: dict[tuple[int, int], dict] = {}
    for p in pits:
        try:
            out[(int(p["driver_number"]), int(p["lap_number"]))] = p
        except (KeyError, TypeError, ValueError):
            continue
    return out


def _build_stints(stints: list[dict], pits: list[dict], laps: list[dict]) -> list[dict]:
    pit_by_key = _pit_lookup(pits)
    laps_by_key = {}
    for lap in laps:
        try:
            laps_by_key[(int(lap["driver_number"]), int(lap["lap_number"]))] = lap
        except (KeyError, TypeError, ValueError):
            continue

    by_driver: dict[int, list[dict]] = defaultdict(list)
    for s in stints:
        try:
            by_driver[int(s["driver_number"])].append(s)
        except (KeyError, TypeError, ValueError):
            continue

    out: list[dict] = []
    for dn, ds in by_driver.items():
        ds.sort(key=lambda s: int(s.get("stint_number") or 0))
        for i, s in enumerate(ds):
            try:
                start_lap = int(s["lap_start"])
                end_lap = int(s["lap_end"])
            except (KeyError, TypeError, ValueError):
                continue
            pit_row = pit_by_key.get((dn, end_lap))
            pit_delta = pit_row.get("lane_duration") or pit_row.get("pit_duration") if pit_row else None
            next_stint = ds[i + 1] if i + 1 < len(ds) else None

            clean_times = []
            for lap_num in range(start_lap, end_lap + 1):
                lap = laps_by_key.get((dn, lap_num))
                if lap is None or lap.get("is_pit_out_lap") or (dn, lap_num) in pit_by_key:
                    continue
                dur = lap.get("lap_duration")
                if dur and dur > 0:
                    clean_times.append(float(dur))
            slope = extract._slope_sec_per_lap(clean_times)

            out.append({
                "driverNumber":     dn,
                "stintNumber":      int(s.get("stint_number") or (i + 1)),
                "compound":         str(s.get("compound") or "UNKNOWN"),
                "startLap":         start_lap,
                "endLap":           end_lap,
                "totalLaps":        end_lap - start_lap + 1,
                "pitInLap":         end_lap if pit_row else None,
                "pitOutLap":        int(next_stint["lap_start"]) if next_stint and next_stint.get("lap_start") is not None else None,
                "pitDeltaSec":      round(float(pit_delta), 2) if pit_delta else None,
                "averageDegPerLap": round(slope, 4) if slope is not None else None,
            })
    return out


def _build_weather(weather: list[dict], laps: list[dict]) -> list[dict]:
    """Nearest weather sample per lap, keyed on wall clock (the FastF1 path
    uses session time — same idea, different clock)."""
    samples = []
    for w in weather:
        if w.get("date"):
            samples.append((parse_openf1_date(w["date"]), w))
    if not samples:
        return []
    samples.sort(key=lambda s: s[0])

    lap_starts: dict[int, dt.datetime] = {}
    for lap in laps:
        if not lap.get("date_start"):
            continue
        try:
            num = int(lap["lap_number"])
        except (TypeError, ValueError):
            continue
        started = parse_openf1_date(lap["date_start"])
        if num not in lap_starts or started < lap_starts[num]:
            lap_starts[num] = started

    out: list[dict] = []
    for num in sorted(lap_starts):
        target = lap_starts[num]
        _, w = min(samples, key=lambda s: abs(s[0] - target))
        out.append({
            "lap":           num,
            "airTemp":       float(w.get("air_temperature") or 0),
            "trackTemp":     float(w.get("track_temperature") or 0),
            "humidity":      float(w.get("humidity") or 0),
            "windSpeed":     float(w.get("wind_speed") or 0),
            "windDirection": float(w.get("wind_direction") or 0),
            "rainfall":      bool(w.get("rainfall")),
        })
    return out


def _build_processed_laps(
    laps: list[dict],
    stints: list[dict],
    pits: list[dict],
    race_control: list[dict],
    position_events: list[dict],
    windows: dict[int, list[tuple[int, dt.datetime, dt.datetime]]],
) -> list[dict]:
    pit_by_key = _pit_lookup(pits)

    stints_by_driver: dict[int, list[dict]] = defaultdict(list)
    for s in stints:
        try:
            stints_by_driver[int(s["driver_number"])].append(s)
        except (KeyError, TypeError, ValueError):
            continue

    sc_laps: set[int] = set()
    for msg in race_control:
        if "safety" in str(msg.get("category") or "").lower() and msg.get("lap_number") is not None:
            try:
                sc_laps.add(int(msg["lap_number"]))
            except (TypeError, ValueError):
                continue

    # /position is sparse change events; build a per-driver stepwise series.
    pos_by_driver: dict[int, list[tuple[dt.datetime, int]]] = defaultdict(list)
    for ev in position_events:
        if not ev.get("date") or ev.get("position") is None:
            continue
        try:
            pos_by_driver[int(ev["driver_number"])].append(
                (parse_openf1_date(ev["date"]), int(ev["position"]))
            )
        except (KeyError, TypeError, ValueError):
            continue
    for series in pos_by_driver.values():
        series.sort(key=lambda e: e[0])

    def _position_at(dn: int, when: dt.datetime) -> int | None:
        series = pos_by_driver.get(dn)
        if not series:
            return None
        dates = [e[0] for e in series]
        idx = bisect_right(dates, when) - 1
        return series[idx][1] if idx >= 0 else None

    best_by_driver: dict[int, float] = {}
    for lap in laps:
        dur = lap.get("lap_duration")
        if not dur:
            continue
        try:
            dn = int(lap["driver_number"])
        except (KeyError, TypeError, ValueError):
            continue
        if dn not in best_by_driver or dur < best_by_driver[dn]:
            best_by_driver[dn] = float(dur)

    out: list[dict] = []
    for lap in laps:
        try:
            dn = int(lap["driver_number"])
            lap_num = int(lap["lap_number"])
        except (KeyError, TypeError, ValueError):
            continue
        if dn == 0 or lap_num == 0:
            continue
        lap_time = float(lap["lap_duration"]) if lap.get("lap_duration") else None
        sectors = [
            round(float(lap[k]), 4) if lap.get(k) else None
            for k in ("duration_sector_1", "duration_sector_2", "duration_sector_3")
        ]

        compound, stint_lap, tyre_life, fresh = "UNKNOWN", 0, 0, False
        for s in stints_by_driver.get(dn, []):
            try:
                s_start, s_end = int(s["lap_start"]), int(s["lap_end"])
            except (KeyError, TypeError, ValueError):
                continue
            if s_start <= lap_num <= s_end:
                age = int(s.get("tyre_age_at_start") or 0)
                # FastF1's TyreLife counts laps ON the tyre including the
                # current one — a fresh set's first lap is TyreLife 1.
                tyre_life = age + (lap_num - s_start) + 1
                stint_lap = tyre_life
                compound = str(s.get("compound") or "UNKNOWN")
                fresh = age == 0
                break

        lap_end = None
        for w_lap, _, w_end in windows.get(dn, []):
            if w_lap == lap_num:
                lap_end = w_end
                break
        position = _position_at(dn, lap_end) if lap_end else None

        events: list[str] = []
        if lap_time is None:
            events.append("incomplete")
        if (dn, lap_num) in pit_by_key:
            events.append("pit_in")
        if lap_num in sc_laps:
            events.append("sc_deployed")
        if lap_time and best_by_driver.get(dn) == lap_time and lap_time > 0:
            events.append("personal_best")

        out.append({
            "driverNumber": dn,
            "lap":          lap_num,
            "lapTimeSec":   round(lap_time, 4) if lap_time else None,
            "sectors":      sectors,
            "compound":     compound,
            "stintLap":     stint_lap,
            "tyreLife":     tyre_life,
            "freshTyre":    fresh,
            "position":     position,
            "events":       events,
        })
    return out


# ── Phase 2: lap telemetry channels + aggregates ─────────────────────────────

def _build_driver_channels(
    session_key: str,
    dn: int,
    windows: list[tuple[int, dt.datetime, dt.datetime]],
    car: list[dict],
    loc: list[dict] | None,
    laps_by_key: dict[tuple[int, int], dict],
    t0: dt.datetime,
) -> tuple[list[dict], dict[tuple[int, int], dict]]:
    per_lap: dict[int, list[tuple[dt.datetime, dict]]] = defaultdict(list)
    for s in car:
        if not s.get("date"):
            continue
        when = parse_openf1_date(s["date"])
        per_lap[_assign_lap(windows, when)].append((when, s))

    z_per_lap: dict[int, list[float]] = defaultdict(list)
    for s in loc or []:
        if not s.get("date") or s.get("z") is None:
            continue
        z_per_lap[_assign_lap(windows, parse_openf1_date(s["date"]))].append(float(s["z"]))

    rows: list[dict] = []
    aggregates: dict[tuple[int, int], dict] = {}
    for lap_num, start, _end in windows:
        samples = per_lap.get(lap_num)
        if not samples or len(samples) < 3:
            continue
        samples.sort(key=lambda s: s[0])

        session_time: list[float] = []
        speed: list[float] = []
        throttle: list[float] = []
        brake: list[int] = []
        drs: list[int] = []
        n_gear: list[int] = []
        rpm: list[int] = []
        distance: list[float] = []
        dist = 0.0
        prev_t: float | None = None
        for when, s in samples:
            t = (when - t0).total_seconds()
            spd = float(s.get("speed") or 0.0)
            if prev_t is not None:
                # Clamp dt so stream gaps don't inflate the integrated distance.
                dist += spd / 3.6 * min(max(t - prev_t, 0.0), 2.0)
            prev_t = t
            session_time.append(t)
            speed.append(spd)
            throttle.append(float(s.get("throttle") or 0.0))
            brake.append(1 if float(s.get("brake") or 0) >= 50 else 0)
            drs.append(int(s.get("drs") or 0))
            n_gear.append(int(s.get("n_gear") or 0))
            rpm.append(int(s.get("rpm") or 0))
            distance.append(dist)

        lap_row = laps_by_key.get((dn, lap_num), {})
        lap_start_sec = (start - t0).total_seconds()
        s1 = lap_row.get("duration_sector_1")
        s2 = lap_row.get("duration_sector_2")
        s1_end = lap_start_sec + float(s1) if s1 else None
        s2_end = s1_end + float(s2) if s1_end is not None and s2 else None

        agg = extract.aggregate_from_arrays(
            session_time_sec=session_time,
            speed=speed,
            throttle=throttle,
            brake=brake,
            drs=drs,
            n_gear=n_gear,
            distance=distance,
            dist_to_ahead=[],
            lap_start_sec=lap_start_sec,
            s1_end_sec=s1_end,
            s2_end_sec=s2_end,
            rpm=rpm,
            z=z_per_lap.get(lap_num),
        )
        # Not derivable from OpenF1 (/intervals is seconds, not meters) —
        # honest nulls beat a fabricated 0.0.
        agg["avgGapToAheadM"] = None
        agg["minGapToAheadM"] = None
        aggregates[(dn, lap_num)] = agg

        channels = {
            "sessionTime": [round(t, 4) for t in session_time],
            "distance":    [round(d, 1) for d in distance],
            "speed":       [round(s, 1) for s in speed],
            "throttle":    [round(t, 1) for t in throttle],
            "brake":       brake,
            "drs":         drs,
            "nGear":       n_gear,
            "rpm":         rpm,
        }
        rows.append({
            "session_key":    session_key,
            "driver_number":  dn,
            "lap":            lap_num,
            "sample_rate_hz": OPENF1_SAMPLE_RATE_HZ,
            "frame_count":    len(session_time),
            "channels":       {k: channels[k] for k in _STORE_CHANNELS if k in channels},
        })
    return rows, aggregates


# ── Phase 3: positions + circuit ─────────────────────────────────────────────

def _build_position_row(
    session_key: str,
    ckey: str,
    dn: int,
    windows: list[tuple[int, dt.datetime, dt.datetime]],
    loc: list[dict],
    pit_windows: list[tuple[dt.datetime, dt.datetime]],
    t0: dt.datetime,
) -> dict | None:
    frames_t: list[int] = []
    frames_x: list[float] = []
    frames_y: list[float] = []
    frames_z: list[float] = []
    frames_lap: list[int] = []
    frames_status: list[int] = []
    last_ms = -_POS_SAMPLE_PERIOD_MS

    for s in loc:
        if not s.get("date"):
            continue
        x, y = s.get("x"), s.get("y")
        if x is None or y is None or (x == 0 and y == 0):  # (0,0) = no GPS signal
            continue
        when = parse_openf1_date(s["date"])
        t_ms = int((when - t0).total_seconds() * 1000)
        if t_ms - last_ms < _POS_SAMPLE_PERIOD_MS:
            continue
        status = 2 if any(p_from <= when <= p_to for p_from, p_to in pit_windows) else 0
        frames_t.append(t_ms)
        frames_x.append(round(float(x), 1))
        frames_y.append(round(float(y), 1))
        frames_z.append(round(float(s.get("z") or 0.0), 1))
        frames_lap.append(_assign_lap(windows, when))
        frames_status.append(status)
        last_ms = t_ms

    if not frames_t:
        return None
    return {
        "session_key":    session_key,
        "circuit_key":    ckey,
        "driver_number":  dn,
        "sample_rate_hz": OPENF1_SAMPLE_RATE_HZ,
        "frame_count":    len(frames_t),
        "t0_ms":          frames_t[0],
        "t_end_ms":       frames_t[-1],
        "frames": {
            "t":      frames_t,
            "x":      frames_x,
            "y":      frames_y,
            "z":      frames_z,
            "lap":    frames_lap,
            "status": frames_status,
        },
    }


def _is_plausible_loop(points: list[tuple[float, float]]) -> bool:
    """Scale-free closed-circuit checks, ported from ingestCircuits.ts."""
    pts: list[tuple[float, float]] = []
    for p in points:
        if not pts or pts[-1] != p:
            pts.append(p)
    if len(pts) < 50:
        return False
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    diag = (w * w + h * h) ** 0.5
    if diag <= 0:
        return False
    if min(w, h) / max(w, h) < 0.06:
        return False
    perim = sum(
        ((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2) ** 0.5
        for i in range(1, len(pts))
    )
    if perim / diag < 2:
        return False
    gap = ((pts[0][0] - pts[-1][0]) ** 2 + (pts[0][1] - pts[-1][1]) ** 2) ** 0.5
    if gap / diag > 0.25:
        return False
    area2 = 0.0
    for i in range(len(pts)):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % len(pts)]
        area2 += ax * by - bx * ay
    if abs(area2) / 2 / (w * h) < 0.05:
        return False
    return True


def _clean_lap_candidates(laps: list[dict]) -> dict[int, list[tuple[int, dt.datetime, dt.datetime]]]:
    """Per driver: up to two clean-lap outline windows (median first, then
    earliest — the earliest rescues sessions whose location stream died
    mid-race). Ported from ingestCircuits.ts cleanLapWindows; tried per driver
    as their location data is fetched rather than globally ordered."""
    by_driver: dict[int, list[dict]] = defaultdict(list)
    for lap in laps:
        if lap.get("is_pit_out_lap") or not lap.get("date_start"):
            continue
        dur = lap.get("lap_duration")
        if not isinstance(dur, (int, float)) or not (_MIN_LAP_SECONDS <= dur <= _MAX_LAP_SECONDS):
            continue
        try:
            by_driver[int(lap["driver_number"])].append(lap)
        except (KeyError, TypeError, ValueError):
            continue

    def _window(lap: dict) -> tuple[int, dt.datetime, dt.datetime]:
        start = parse_openf1_date(lap["date_start"])
        # Pad the tail slightly so the final samples overlap the start line.
        end = start + dt.timedelta(seconds=float(lap["lap_duration"]) + 2)
        return int(lap["lap_number"]), start, end

    out: dict[int, list[tuple[int, dt.datetime, dt.datetime]]] = {}
    for dn, dl in by_driver.items():
        fastest = min(float(l["lap_duration"]) for l in dl)
        clean = sorted(
            (l for l in dl if float(l["lap_duration"]) <= fastest * _CLEAN_LAP_TOLERANCE),
            key=lambda l: float(l["lap_duration"]),
        )
        if not clean:
            continue
        median = clean[len(clean) // 2]
        earliest = min(clean, key=lambda l: int(l["lap_number"]))
        windows = [_window(median)]
        if int(earliest["lap_number"]) != int(median["lap_number"]):
            windows.append(_window(earliest))
        out[dn] = windows
    return out


def _try_build_circuit(
    year: int,
    gp_name: str,
    circuit_name: str,
    country: str,
    candidates: list[tuple[int, dt.datetime, dt.datetime]],
    loc: list[dict],
    laps_by_key: dict[tuple[int, int], dict],
    dn: int,
    t0: dt.datetime,
) -> dict | None:
    ckey = extract.circuit_key(gp_name)
    for lap_num, start, end in candidates:
        pts = [
            s for s in loc
            if s.get("date") and s.get("x") is not None and s.get("y") is not None
            and not (s["x"] == 0 and s["y"] == 0)
            and start <= parse_openf1_date(s["date"]) <= end
        ]
        xy = [(float(s["x"]), float(s["y"])) for s in pts]
        if not _is_plausible_loop(xy):
            continue

        step = max(1, len(pts) // 400)
        outline_x: list[float] = []
        outline_y: list[float] = []
        outline_z: list[float] = []
        outline_t: list[float] = []
        for i in range(0, len(pts), step):
            s = pts[i]
            outline_x.append(float(s["x"]))
            outline_y.append(float(s["y"]))
            outline_z.append(float(s["z"]) if s.get("z") is not None else float("nan"))
            outline_t.append((parse_openf1_date(s["date"]) - t0).total_seconds())

        if outline_z and any(v == v for v in outline_z) and any(v for v in outline_z if v == v):
            smoothed = pd.Series(outline_z).rolling(window=7, center=True, min_periods=1).mean()
            outline_z = [round(float(v), 1) if pd.notna(v) else 0.0 for v in smoothed]
        else:
            outline_z = []

        outline_doc: dict = {"x": outline_x, "y": outline_y}
        if outline_z:
            outline_doc["z"] = outline_z

        sector_boundaries = None
        lap_row = laps_by_key.get((dn, lap_num), {})
        s1 = lap_row.get("duration_sector_1")
        s2 = lap_row.get("duration_sector_2")
        if s1 and s2 and outline_t:
            lap_start_sec = (start - t0).total_seconds()
            s1_end = lap_start_sec + float(s1)
            s2_end = s1_end + float(s2)
            idx1 = min(range(len(outline_t)), key=lambda i: abs(outline_t[i] - s1_end))
            idx2 = min(range(len(outline_t)), key=lambda i: abs(outline_t[i] - s2_end))
            if 0 < idx1 < idx2 < len(outline_x) - 1:
                sector_boundaries = {"index1": idx1, "index2": idx2}

        logger.info(
            "Circuit %s/%s from OpenF1: drv %s lap %s, %d outline pts",
            ckey, year, dn, lap_num, len(outline_x),
        )
        return {
            "circuit_key":       ckey,
            "year":              year,
            "gp_name":           gp_name,
            "circuit_name":      circuit_name,
            "country":           country,
            "rotation_deg":      0.0,   # OpenF1 exposes no rotation metadata
            "corners":           [],    # ...nor corner annotations
            "outline":           outline_doc,
            "bounds": {
                "minX": min(outline_x), "maxX": max(outline_x),
                "minY": min(outline_y), "maxY": max(outline_y),
            },
            "sector_boundaries": sector_boundaries,
        }
    return None


# ── orchestrator ─────────────────────────────────────────────────────────────

def ingest_session_openf1(
    sink: SupabaseSink, year: int, gp_name: str, session_type: str
) -> str:
    """OpenF1-sourced equivalent of ingest.ingest_session (same contract)."""
    logger.info("Loading OpenF1 session: %s %s %s", year, gp_name, session_type)
    client = OpenF1Client()

    sched = _resolve_schedule(year, gp_name, session_type)
    gp_name = sched["gp_name"]
    session_key = extract.make_session_key(year, gp_name, session_type)
    ckey = extract.circuit_key(gp_name)
    logger.info("Resolved session_key: %s (gp_name=%r)", session_key, gp_name)

    of1 = _match_openf1_session(client, year, session_type, sched["start_utc"])
    of1_key = int(of1["session_key"])
    t0 = parse_openf1_date(of1["date_start"])

    laps = client.laps(of1_key)
    if not laps:
        raise SessionDataUnavailable(
            f"OpenF1 has no lap data yet for {year} {gp_name} {session_type} "
            "(session too recent?). Try again later."
        )
    of1_drivers = client.drivers(of1_key)
    stints = client.stints(of1_key)
    pits = client.pit(of1_key)
    race_control = client.race_control(of1_key)
    weather = client.weather(of1_key)
    results = client.session_result(of1_key)
    grid = client.starting_grid(of1_key)
    position_events = client.position(of1_key)

    windows = _lap_windows(laps, t0)
    laps_by_key: dict[tuple[int, int], dict] = {}
    for lap in laps:
        try:
            laps_by_key[(int(lap["driver_number"]), int(lap["lap_number"]))] = lap
        except (KeyError, TypeError, ValueError):
            continue
    pit_windows_by_driver: dict[int, list[tuple[dt.datetime, dt.datetime]]] = defaultdict(list)
    for p in pits:
        if not p.get("date"):
            continue
        lane = p.get("lane_duration") or p.get("pit_duration") or 30.0
        try:
            entered = parse_openf1_date(p["date"])
            pit_windows_by_driver[int(p["driver_number"])].append(
                (entered, entered + dt.timedelta(seconds=float(lane)))
            )
        except (KeyError, TypeError, ValueError):
            continue

    # ── Phase 1 ──────────────────────────────────────────────────────────────
    standings = extract.fetch_championship_standings(year)
    drivers = _build_drivers(of1_drivers, standings)
    session_row = {
        "session_key":      session_key,
        "season":           year,
        "round":            sched["round"],
        "session_type":     session_type,
        "session_name":     str(of1.get("session_name") or ""),
        "gp_name":          gp_name,
        "circuit_key":      ckey,
        "circuit_name":     sched["location"],
        "country":          sched["country"],
        "date_start":       of1.get("date_start"),
        "drivers":          drivers,
        "session_results":  _build_results(results, grid, drivers, session_type),
        "stints":           _build_stints(stints, pits, laps),
        "weather_data":     _build_weather(weather, laps),
        "positions_status": "pending",
        "telemetry_status": "pending",
        "data_source":      "openf1",
    }
    sink.upsert("vizf1_telemetry_sessions", [session_row], on_conflict="session_key")
    processed_laps = _build_processed_laps(laps, stints, pits, race_control, position_events, windows)

    # ── Phases 2 + 3: one location/car_data pass per driver ─────────────────
    is_practice = session_type.upper().startswith("FP")
    phase_errors: list[str] = []
    aggregates: dict[tuple[int, int], dict] = {}
    if is_practice:
        logger.info("Practice session — skipping lap-telemetry channel storage")
        _mark_status(sink, session_key, {"telemetry_status": "skipped"})

    circuit_needed = False
    try:
        existing = sink.fetch_rows(
            "vizf1_telemetry_circuits", "circuit_key", {"circuit_key": ckey, "year": year}
        )
        circuit_needed = not existing
    except SinkUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001 — when in doubt, never overwrite
        logger.warning("circuit existence check failed (%s) — skipping circuit build", exc)
    candidates = _clean_lap_candidates(laps) if circuit_needed else {}

    circuit_row: dict | None = None
    tele_failures: list[str] = []
    pos_failures: list[str] = []
    positions_written = 0
    for dn in sorted(windows):
        driver_windows = windows[dn]
        span_start = driver_windows[0][1] - dt.timedelta(seconds=60)
        span_end = driver_windows[-1][2] + dt.timedelta(seconds=60)

        loc: list[dict] | None = None
        try:
            loc = client.location(of1_key, dn, span_start, span_end)
        except Exception as exc:  # noqa: BLE001
            logger.warning("location fetch failed drv=%s: %s", dn, exc)

        if not is_practice:
            try:
                car = client.car_data(of1_key, dn, span_start, span_end)
                rows, aggs = _build_driver_channels(
                    session_key, dn, driver_windows, car, loc, laps_by_key, t0
                )
                if rows:
                    sink.upsert("vizf1_lap_telemetry", rows,
                                on_conflict="session_key,driver_number,lap")
                aggregates.update(aggs)
            except SinkUnavailable:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("lap telemetry failed drv=%s: %s", dn, exc)
                tele_failures.append(f"drv {dn}: {exc}")

        try:
            if loc is None:
                raise RuntimeError("location fetch failed")
            row = _build_position_row(
                session_key, ckey, dn, driver_windows, loc,
                pit_windows_by_driver.get(dn, []), t0,
            )
            if row is not None:
                sink.upsert("vizf1_car_positions", [row],
                            on_conflict="session_key,driver_number", chunk=1)
                positions_written += 1
        except SinkUnavailable:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("positions failed drv=%s: %s", dn, exc)
            pos_failures.append(f"drv {dn}: {exc}")

        if circuit_needed and circuit_row is None and loc and dn in candidates:
            try:
                circuit_row = _try_build_circuit(
                    year, gp_name, sched["location"], sched["country"],
                    candidates[dn], loc, laps_by_key, dn, t0,
                )
            except Exception as exc:  # noqa: BLE001
                logger.debug("circuit build attempt failed drv=%s: %s", dn, exc)

    if not is_practice:
        if tele_failures:
            err = "; ".join(tele_failures)[:2000]
            _mark_status(sink, session_key, {"telemetry_status": "failed", "telemetry_error": err})
            phase_errors.append(f"phase 2 (lap telemetry): {len(tele_failures)} driver(s) failed")
        else:
            _mark_status(sink, session_key, {"telemetry_status": "done", "telemetry_error": None})

    try:
        lap_rows = _build_lap_rows(session_key, processed_laps, aggregates)
        sink.upsert("vizf1_telemetry_laps", lap_rows, on_conflict="session_key,driver_number,lap")
    except SinkUnavailable:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("lap rows failed for %s: %s", session_key, exc)
        phase_errors.append(f"lap rows: {exc}")

    if circuit_row is not None:
        try:
            sink.upsert("vizf1_telemetry_circuits", [circuit_row], on_conflict="circuit_key,year")
        except SinkUnavailable:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.warning("circuit upsert failed for %s: %s", ckey, exc)
            pos_failures.append(f"circuit: {exc}")
    elif circuit_needed:
        logger.info("No plausible outline lap found for %s — circuit row skipped", ckey)

    if pos_failures:
        err = "; ".join(pos_failures)[:2000]
        _mark_status(sink, session_key, {"positions_status": "failed", "positions_error": err})
        phase_errors.append(f"phase 3 (positions): {len(pos_failures)} failure(s)")
    else:
        _mark_status(sink, session_key, {"positions_status": "done", "positions_error": None})
        logger.info("Positions done for %s: %d drivers", session_key, positions_written)

    if phase_errors:
        raise IngestPhaseFailure(f"{session_key}: " + "; ".join(phase_errors))
    logger.info("Ingest complete (openf1): %s", session_key)
    return session_key
