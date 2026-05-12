"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import type mapboxgl from "mapbox-gl";
import { Map as MapboxMap, type MapRef } from "react-map-gl/mapbox";
import type { FeatureCollection, LineString, Point } from "geojson";

import type { Airport, Flight, BlackbookPoint, PersonSummary } from "./page";
import PersonDetail from "./PersonDetail";
import AirportDetail from "./AirportDetail";
import BlackbookDetail from "./BlackbookDetail";
import VizmayaLogo from "@/components/VizmayaLogo";
import { epsteinLogoPalette, type EpsteinTheme } from "./theme";

// Three-way discriminated union — one of these (or nothing) is open at a time.
type Selection =
  | { kind: "person"; id: string }
  | { kind: "airport"; iata: string }
  | { kind: "blackbook"; id: number }
  | null;

// ---------------------------------------------------------------------------
// View + colors
// ---------------------------------------------------------------------------

const INITIAL_VIEW_STATE = {
  longitude: -65,
  latitude: 30,
  zoom: 2.5,
  pitch: 0,
  bearing: 0,
};

// Legend rows — colors are pulled from the resolved theme inside the component.
const LEGEND_ROWS = [
  { key: "ember" as const, label: "Airport" },
  { key: "ember" as const, label: "Flight origin" },
  { key: "steel" as const, label: "Flight dest." },
  { key: "rose" as const, label: "Black Book" },
];

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

// Inline-style helper: blend a theme color with transparent so we don't have
// to hand-write rgba() per palette change.
const alpha = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

// Great-circle interpolation, lng/lat → densified lng/lat. Mapbox renders the
// LineString along the globe surface as long as the segments are short.
function greatCirclePath(
  from: [number, number],
  to: [number, number],
  steps = 64
): [number, number][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const phi1 = toRad(lat1), phi2 = toRad(lat2);
  const lam1 = toRad(lng1), lam2 = toRad(lng2);
  const sinPhi1 = Math.sin(phi1), sinPhi2 = Math.sin(phi2);
  const cosPhi1 = Math.cos(phi1), cosPhi2 = Math.cos(phi2);
  const dphi = phi2 - phi1;
  const dlam = lam2 - lam1;
  const a = Math.sin(dphi / 2) ** 2 + cosPhi1 * cosPhi2 * Math.sin(dlam / 2) ** 2;
  const d = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  if (d === 0) return [from, to];
  const sinD = Math.sin(d);
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / sinD;
    const B = Math.sin(f * d) / sinD;
    const x = A * cosPhi1 * Math.cos(lam1) + B * cosPhi2 * Math.cos(lam2);
    const y = A * cosPhi1 * Math.sin(lam1) + B * cosPhi2 * Math.sin(lam2);
    const z = A * sinPhi1 + B * sinPhi2;
    const phi = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lam = Math.atan2(y, x);
    let lngDeg = toDeg(lam);
    // Unwrap longitude relative to the previous vertex. atan2 returns values in
    // [-180, 180], so a path crossing the antimeridian produces a jump from
    // ~-179 to ~+179 — Mapbox would draw that as a 358° loop around the globe
    // instead of a 2° step. Keep consecutive vertices within ±180° of each
    // other so the LineString renders along the actual great-circle direction.
    if (out.length > 0) {
      const prevLng = out[out.length - 1][0];
      while (lngDeg - prevLng > 180) lngDeg -= 360;
      while (prevLng - lngDeg > 180) lngDeg += 360;
    }
    out.push([lngDeg, toDeg(phi)]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LayerVisibility = { flights: boolean; airports: boolean; blackbook: boolean };

interface Props {
  airports: Airport[];
  flights: Flight[];
  blackbook: BlackbookPoint[];
  persons: PersonSummary[];
  theme: EpsteinTheme;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EpsteinMap({ airports, flights, blackbook, persons, theme }: Props) {
  const logoPalette = useMemo(() => epsteinLogoPalette(theme), [theme]);
  // Keep latest theme accessible inside the once-only Mapbox load handler.
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);
  const mapRef = useRef<MapRef | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [yearRange, setYearRange] = useState<[number, number]>([1991, 1994]);
  const [visible, setVisible] = useState<LayerVisibility>({
    flights: true, airports: true, blackbook: false,
  });
  const [selection, setSelection] = useState<Selection>(null);
  const [personFlightIds, setPersonFlightIds] = useState<Set<number> | null>(null);
  const [personBlackbookIds, setPersonBlackbookIds] = useState<Set<number> | null>(null);
  const selectedPersonId = selection?.kind === "person" ? selection.id : null;
  const [hoveredAirport, setHoveredAirport] = useState<Airport | null>(null);
  const [hoveredBlackbook, setHoveredBlackbook] = useState<BlackbookPoint | null>(null);
  const [personQuery, setPersonQuery] = useState("");
  // Mobile-only: bottom sheet expanded vs. peek. Ignored at md+ where the panel is a fixed right sidebar.
  const [mobilePeopleOpen, setMobilePeopleOpen] = useState(false);
  // Mobile-only: year slider is hidden behind a header chip to save screen space. Always visible at md+.
  const [mobileYearOpen, setMobileYearOpen] = useState(false);

  // Keep latest data accessible inside Mapbox event closures (which capture once)
  const airportsRef = useRef(airports);
  const blackbookRef = useRef(blackbook);
  useEffect(() => { airportsRef.current = airports; }, [airports]);
  useEffect(() => { blackbookRef.current = blackbook; }, [blackbook]);

  const airportByCode = useMemo(() => {
    const m = new Map<string, Airport>();
    for (const a of airports) m.set(a.iata, a);
    return m;
  }, [airports]);

  // Year-filtered flights → arcs (one arc per from→to leg)
  const arcs = useMemo(() => {
    type Arc = { fromIata: string; toIata: string; flightId: number; from: [number, number]; to: [number, number] };
    const out: Arc[] = [];
    for (const f of flights) {
      if (!f.year) continue;
      if (f.year < yearRange[0] || f.year > yearRange[1]) continue;
      if (personFlightIds && !personFlightIds.has(f.id)) continue;
      const stops = [...f.from_codes, ...f.to_codes];
      for (let i = 0; i < stops.length - 1; i++) {
        const a = airportByCode.get(stops[i]);
        const b = airportByCode.get(stops[i + 1]);
        if (!a || !b) continue;
        out.push({
          fromIata: stops[i],
          toIata: stops[i + 1],
          flightId: f.id,
          from: [a.lng, a.lat],
          to: [b.lng, b.lat],
        });
      }
    }
    return out;
  }, [flights, yearRange, airportByCode, personFlightIds]);

  const activeAirports = useMemo(() => {
    const touched = new Set<string>();
    for (const a of arcs) {
      touched.add(a.fromIata);
      touched.add(a.toIata);
    }
    return airports.filter((a) => touched.has(a.iata));
  }, [airports, arcs]);

  const maxTraffic = useMemo(
    () => Math.max(1, ...activeAirports.map((a) => a.traffic)),
    [activeAirports]
  );

  const filteredPersons = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }, [persons, personQuery]);

  const filteredBlackbook = useMemo(() => {
    if (personBlackbookIds && personBlackbookIds.size > 0) {
      return blackbook.filter((b) => personBlackbookIds.has(b.id));
    }
    return visible.blackbook ? blackbook : [];
  }, [blackbook, visible.blackbook, personBlackbookIds]);

  // -------------------------------------------------------------------------
  // GeoJSON feature collections derived from filtered data
  // -------------------------------------------------------------------------

  const arcsFC = useMemo<FeatureCollection<LineString>>(() => {
    if (!visible.flights) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: arcs.map((a) => ({
        type: "Feature",
        properties: { fromIata: a.fromIata, toIata: a.toIata, flightId: a.flightId },
        geometry: {
          type: "LineString",
          coordinates: greatCirclePath(a.from, a.to),
        },
      })),
    };
  }, [arcs, visible.flights]);

  const airportsFC = useMemo<FeatureCollection<Point>>(() => {
    const data = visible.airports ? activeAirports : [];
    return {
      type: "FeatureCollection",
      features: data.map((a) => ({
        type: "Feature",
        properties: {
          iata: a.iata,
          full_name: a.full_name,
          city: a.city,
          country: a.country,
          traffic: a.traffic,
          // Pixel radius — 3px floor, scales with sqrt(traffic) to about 15px at the busiest hub.
          radius: 3 + Math.sqrt(a.traffic / maxTraffic) * 12,
          showLabel: a.traffic >= maxTraffic * 0.25,
        },
        geometry: { type: "Point", coordinates: [a.lng, a.lat] },
      })),
    };
  }, [activeAirports, visible.airports, maxTraffic]);

  const blackbookFC = useMemo<FeatureCollection<Point>>(() => {
    return {
      type: "FeatureCollection",
      features: filteredBlackbook.map((b) => ({
        type: "Feature",
        properties: { id: b.id, name: b.name, city: b.city, country: b.country },
        geometry: { type: "Point", coordinates: [b.lng, b.lat] },
      })),
    };
  }, [filteredBlackbook]);

  // -------------------------------------------------------------------------
  // Map setup — runs once when style finishes loading. Sources/layers + hover.
  // -------------------------------------------------------------------------

  const onMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const t = themeRef.current;
    if (!map.getSource("arcs-src")) {
      // lineMetrics enables the line-gradient paint expression below.
      map.addSource("arcs-src", { type: "geojson", data: EMPTY_FC, lineMetrics: true });
      map.addSource("airports-src", { type: "geojson", data: EMPTY_FC });
      map.addSource("blackbook-src", { type: "geojson", data: EMPTY_FC });

      map.addLayer({
        id: "arcs-line",
        type: "line",
        source: "arcs-src",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-width": 1.2,
          "line-opacity": 0.55,
          "line-gradient": [
            "interpolate",
            ["linear"],
            ["line-progress"],
            0, t.ember,
            1, t.steel,
          ],
        },
      });

      map.addLayer({
        id: "blackbook-circle",
        type: "circle",
        source: "blackbook-src",
        paint: {
          "circle-radius": 4,
          "circle-color": t.rose,
          "circle-opacity": 0.78,
          "circle-stroke-color": t.bone,
          "circle-stroke-opacity": 0.55,
          "circle-stroke-width": 1,
        },
      });

      map.addLayer({
        id: "blackbook-label",
        type: "symbol",
        source: "blackbook-src",
        layout: {
          "text-field": ["coalesce", ["get", "city"], ["get", "name"]],
          "text-size": 10,
          "text-anchor": "top",
          "text-offset": [0, 0.8],
          "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
          // Hidden until a person is selected; toggled via setLayoutProperty below.
          visibility: "none",
        },
        paint: {
          "text-color": t.rose,
          "text-opacity": 0.95,
          "text-halo-color": t.ink,
          "text-halo-width": 1.5,
        },
      });

      map.addLayer({
        id: "airports-circle",
        type: "circle",
        source: "airports-src",
        paint: {
          "circle-radius": ["get", "radius"],
          "circle-color": t.ember,
          "circle-opacity": 0.88,
          "circle-stroke-color": t.bone,
          "circle-stroke-opacity": 0.55,
          "circle-stroke-width": 1,
        },
      });

      map.addLayer({
        id: "airports-label",
        type: "symbol",
        source: "airports-src",
        filter: ["==", ["get", "showLabel"], true],
        layout: {
          "text-field": ["get", "iata"],
          "text-size": 11,
          "text-anchor": "bottom",
          "text-offset": [0, -0.8],
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
        },
        paint: {
          "text-color": t.bone,
          "text-opacity": 0.92,
          "text-halo-color": t.ink,
          "text-halo-width": 1.5,
        },
      });
    }

    // Hover handlers — Mapbox events fire per layer, so they only trigger
    // when the cursor is actually over a circle. The closures read latest
    // airports/blackbook from refs since this effect runs once.
    const onAirportEnter = (e: mapboxgl.MapLayerMouseEvent) => {
      const iata = e.features?.[0]?.properties?.iata as string | undefined;
      const hit = iata ? airportsRef.current.find((a) => a.iata === iata) : null;
      setHoveredAirport(hit ?? null);
      map.getCanvas().style.cursor = "pointer";
    };
    const onAirportLeave = () => {
      setHoveredAirport(null);
      map.getCanvas().style.cursor = "";
    };
    map.on("mousemove", "airports-circle", onAirportEnter);
    map.on("mouseleave", "airports-circle", onAirportLeave);
    map.on("click", "airports-circle", (e) => {
      const iata = e.features?.[0]?.properties?.iata as string | undefined;
      if (iata) setSelection({ kind: "airport", iata });
    });

    const onBlackbookEnter = (e: mapboxgl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as number | undefined;
      const hit = id != null ? blackbookRef.current.find((b) => b.id === id) : null;
      setHoveredBlackbook(hit ?? null);
      map.getCanvas().style.cursor = "pointer";
    };
    const onBlackbookLeave = () => {
      setHoveredBlackbook(null);
      map.getCanvas().style.cursor = "";
    };
    map.on("mousemove", "blackbook-circle", onBlackbookEnter);
    map.on("mouseleave", "blackbook-circle", onBlackbookLeave);
    map.on("click", "blackbook-circle", (e) => {
      const id = e.features?.[0]?.properties?.id as number | undefined;
      if (id != null) setSelection({ kind: "blackbook", id });
    });

    setMapLoaded(true);
  }, []);

  // Push fresh GeoJSON into the sources whenever the derived FCs change.
  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    (map.getSource("arcs-src") as mapboxgl.GeoJSONSource | undefined)?.setData(arcsFC);
  }, [arcsFC, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    (map.getSource("airports-src") as mapboxgl.GeoJSONSource | undefined)?.setData(airportsFC);
  }, [airportsFC, mapLoaded]);

  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    (map.getSource("blackbook-src") as mapboxgl.GeoJSONSource | undefined)?.setData(blackbookFC);
  }, [blackbookFC, mapLoaded]);

  // Blackbook label visibility + radius emphasis when filtered to a person.
  useEffect(() => {
    if (!mapLoaded) return;
    const map = mapRef.current?.getMap();
    if (!map) return;
    const focused = Boolean(personBlackbookIds && personBlackbookIds.size > 0);
    map.setLayoutProperty("blackbook-label", "visibility", focused ? "visible" : "none");
    map.setPaintProperty("blackbook-circle", "circle-radius", focused ? 6 : 4);
  }, [personBlackbookIds, mapLoaded]);

  // -------------------------------------------------------------------------
  // Person selection
  // -------------------------------------------------------------------------

  function selectPerson(personId: string) {
    setSelection({ kind: "person", id: personId });
    setPersonFlightIds(null);
    setPersonBlackbookIds(null);
    setMobilePeopleOpen(false);
  }

  function clearSelection() {
    setSelection(null);
    setPersonFlightIds(null);
    setPersonBlackbookIds(null);
  }

  const handlePersonDataLoaded = useCallback(
    (
      personId: string,
      flightIds: number[],
      iataCodes: string[],
      blackbookIds: number[]
    ) => {
      if (personId !== selectedPersonId) return;

      setPersonFlightIds(new Set(flightIds));
      setPersonBlackbookIds(new Set(blackbookIds));

      const coords: Array<{ lng: number; lat: number }> = [];
      for (const c of iataCodes) {
        const a = airportByCode.get(c);
        if (a) coords.push({ lng: a.lng, lat: a.lat });
      }
      const bbSet = new Set(blackbookIds);
      for (const b of blackbook) {
        if (bbSet.has(b.id)) coords.push({ lng: b.lng, lat: b.lat });
      }
      if (coords.length === 0) return;
      const lngs = coords.map((c) => c.lng);
      const lats = coords.map((c) => c.lat);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const span = Math.max(maxLng - minLng, maxLat - minLat);
      mapRef.current?.flyTo({
        center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
        zoom: Math.max(2, Math.min(5, 6 - Math.log2(Math.max(span, 1)))),
        duration: 900,
        essential: true,
      });
    },
    [selectedPersonId, airportByCode, blackbook]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasData = airports.length > 0 || flights.length > 0;

  return (
    <div
      className="relative w-full h-screen overflow-hidden font-(--font-inter)"
      style={{
        background: theme.ink,
        color: theme.bone,
        '--vmy-ink': theme.ink,
        '--vmy-surface': theme.surface,
        '--vmy-elevated': theme.elevated,
        '--vmy-bone': theme.bone,
        '--vmy-muted': theme.muted,
        '--vmy-line': theme.line,
        '--vmy-ember': theme.ember,
        '--vmy-steel': theme.steel,
        '--vmy-rose': theme.rose,
        '--vmy-signal': theme.signal,
      } as React.CSSProperties}
    >
      <MapboxMap
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection="globe"
        doubleClickZoom={false}
        onLoad={onMapLoad}
        style={{ position: "absolute", inset: 0 }}
      />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 md:right-80 z-10 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-4 bg-linear-to-b from-(--vmy-ink)/95 via-(--vmy-ink)/70 to-transparent pointer-events-none">
        <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          {/* Mobile: logo + year chip share the top row; title drops below. Desktop: logo sits inline with the title. */}
          <div className="flex items-center justify-between md:justify-start gap-3">
            <Link
              href="/"
              aria-label="Vizmaya home"
              className="pointer-events-auto shrink-0 rounded-md transition-opacity hover:opacity-80 focus:opacity-80 focus:outline-none"
            >
              <VizmayaLogo
                className="w-[150px] h-[36px] md:w-[180px] md:h-[44px]"
                palette={logoPalette}
              />
            </Link>
            <button
              type="button"
              onClick={() => setMobileYearOpen((o) => !o)}
              aria-label="Toggle year range"
              aria-expanded={mobileYearOpen}
              className="md:hidden pointer-events-auto shrink-0 rounded-full px-3 py-1 text-[11px] font-mono"
              style={{
                background: alpha(theme.surface, 85),
                border: `1px solid ${alpha(theme.bone, 12)}`,
                color: theme.ember,
              }}
            >
              {yearRange[0]}–{yearRange[1]}
            </button>
          </div>
          <div>
            <h1
              className="text-base md:text-lg leading-tight tracking-tight"
              style={{ fontFamily: "var(--font-fraunces), serif", color: theme.bone, fontWeight: 500 }}
            >
              The Epstein Flight Network
            </h1>
            <p className="text-[11px] md:text-xs mt-0.5 font-mono uppercase tracking-[0.18em]" style={{ color: theme.muted }}>
              <span style={{ color: theme.ember }}>{arcs.length}</span> legs
              <span className="mx-1.5 opacity-50">·</span>
              <span style={{ color: theme.ember }}>{activeAirports.length}</span> airports
              <span className="mx-1.5 opacity-50">·</span>
              <span style={{ color: theme.ember }}>{persons.length}</span> people
            </p>
          </div>
        </div>

        <div
          className="pointer-events-auto flex gap-1 rounded-full p-1"
          style={{ background: alpha(theme.surface, 85), border: `1px solid ${alpha(theme.bone, 10)}` }}
        >
          {(["flights", "airports", "blackbook"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              className="px-3 py-1 rounded-full text-[11px] font-mono uppercase tracking-wider transition-colors"
              style={
                visible[k]
                  ? { background: theme.ember, color: theme.ink }
                  : { color: alpha(theme.bone, 55), background: "transparent" }
              }
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* ── Year slider ──────────────────────────────────────────────────── */}
      {/* Mobile: hidden behind the header chip; toggled by `mobileYearOpen`. Desktop: always-visible bottom-center pill. */}
      <div
        className={`absolute z-10 pointer-events-auto rounded-xl px-4 py-3 backdrop-blur left-3 right-3 top-[120px] w-auto translate-x-0 md:left-1/2 md:right-auto md:top-auto md:bottom-6 md:w-[420px] md:-translate-x-1/2 ${mobileYearOpen ? "" : "hidden md:block"}`}
        style={{
          background: alpha(theme.surface, 88),
          border: `1px solid ${alpha(theme.bone, 10)}`,
          boxShadow: `0 12px 32px -8px rgba(0, 0, 0, 0.6)`,
        }}
      >
        <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
          <span className="uppercase tracking-[0.18em]" style={{ color: theme.muted }}>Years</span>
          <span style={{ color: theme.ember }}>{yearRange[0]} – {yearRange[1]}</span>
        </div>
        <DualRange
          min={1991}
          max={1994}
          value={yearRange}
          onChange={setYearRange}
          theme={theme}
        />
        <p className="text-[10px] font-mono mt-1.5 leading-snug" style={{ color: alpha(theme.bone, 40) }}>
          Coverage: pages 1–31 of the flight logs (1991–1994 of 1991–2019).
          {personFlightIds &&
            ` Filtered to ${personFlightIds.size} flight${personFlightIds.size === 1 ? "" : "s"}.`}
        </p>
      </div>

      {/* ── Hover airport tooltip ────────────────────────────────────────── */}
      {hoveredAirport && (
        <div
          className="absolute top-20 md:top-16 left-1/2 -translate-x-1/2 z-20 rounded-md px-3 py-1.5 text-xs font-mono pointer-events-none whitespace-nowrap backdrop-blur"
          style={{
            background: alpha(theme.surface, 92),
            border: `1px solid ${alpha(theme.ember, 35)}`,
            color: theme.ember,
          }}
        >
          <span style={{ fontFamily: "var(--font-fraunces), serif", fontStyle: "italic", color: theme.bone }} className="mr-1.5">
            {hoveredAirport.iata}
          </span>
          {hoveredAirport.full_name ?? hoveredAirport.city}
          {hoveredAirport.country ? `, ${hoveredAirport.country}` : ""}
          <span className="ml-2" style={{ color: alpha(theme.bone, 40) }}>{hoveredAirport.traffic} legs</span>
        </div>
      )}

      {/* ── Hover blackbook tooltip ──────────────────────────────────────── */}
      {hoveredBlackbook && (
        <div
          className="absolute top-20 md:top-16 left-1/2 -translate-x-1/2 z-20 rounded-md px-3 py-1.5 text-xs font-mono pointer-events-none whitespace-nowrap backdrop-blur"
          style={{
            background: alpha(theme.surface, 92),
            border: `1px solid ${alpha(theme.rose, 40)}`,
            color: alpha(theme.bone, 70),
          }}
        >
          <span style={{ fontFamily: "var(--font-fraunces), serif", fontStyle: "italic", color: theme.rose }}>
            {hoveredBlackbook.name}
          </span>
          {(hoveredBlackbook.city || hoveredBlackbook.country) && (
            <span className="ml-2" style={{ color: alpha(theme.bone, 45) }}>
              {[hoveredBlackbook.city, hoveredBlackbook.country].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      {/* Hidden on mobile — bottom edge is reserved for the people sheet. */}
      <div className="absolute bottom-6 left-5 z-10 hidden md:flex flex-col gap-1.5 pointer-events-none">
        {LEGEND_ROWS.map((l) => {
          const c = theme[l.key];
          return (
            <div key={l.label} className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: c, boxShadow: `0 0 6px ${c}` }}
              />
              <span className="text-[11px] font-mono uppercase tracking-wider" style={{ color: alpha(theme.bone, 50) }}>
                {l.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Detail panel (one of three) ──────────────────────────────────── */}
      {selection?.kind === "person" && (
        <PersonDetail
          personId={selection.id}
          person={persons.find((p) => p.entity_id === selection.id)}
          onClose={clearSelection}
          onDataLoaded={handlePersonDataLoaded}
        />
      )}
      {selection?.kind === "airport" && (
        <AirportDetail
          iata={selection.iata}
          onClose={clearSelection}
          onSelectPerson={selectPerson}
        />
      )}
      {selection?.kind === "blackbook" && (
        <BlackbookDetail
          blackbookId={selection.id}
          onClose={clearSelection}
          onSelectPerson={selectPerson}
        />
      )}

      {/* ── Persons sidebar / mobile bottom sheet ────────────────────────── */}
      <div
        className={`absolute z-10 flex flex-col backdrop-blur-sm overflow-hidden transition-[max-height] duration-300
          left-0 right-0 bottom-0 rounded-t-2xl border-t
          md:left-auto md:right-0 md:top-0 md:w-80 md:rounded-none md:border-t-0 md:border-l
          ${mobilePeopleOpen ? "max-h-[60vh]" : "max-h-[112px]"}
          md:max-h-none`}
        style={{
          background: alpha(theme.surface, 85),
          borderTopColor: alpha(theme.bone, 8),
          borderLeftColor: alpha(theme.bone, 8),
        }}
      >
        <button
          type="button"
          onClick={() => setMobilePeopleOpen((o) => !o)}
          aria-label={mobilePeopleOpen ? "Collapse people list" : "Expand people list"}
          className="md:hidden self-center mt-2 mb-1 h-1 w-10 rounded-full shrink-0"
          style={{ background: alpha(theme.bone, 30) }}
        />
        <div
          className="px-4 pt-1 md:pt-4 pb-3 shrink-0"
          style={{ borderBottom: `1px solid ${alpha(theme.bone, 8)}` }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <p
              className="text-[11px] font-mono uppercase tracking-[0.22em]"
              style={{ color: alpha(theme.bone, 45) }}
            >
              Dramatis Personae
            </p>
            <span className="text-[10px] font-mono" style={{ color: alpha(theme.bone, 30) }}>
              {filteredPersons.length}
            </span>
          </div>
          <input
            type="search"
            value={personQuery}
            onChange={(e) => setPersonQuery(e.target.value)}
            onFocus={() => setMobilePeopleOpen(true)}
            placeholder="Search names…"
            className="w-full rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none"
            style={{
              background: alpha(theme.ink, 70),
              border: `1px solid ${alpha(theme.bone, 10)}`,
              color: theme.bone,
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {filteredPersons.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs font-mono" style={{ color: alpha(theme.bone, 30) }}>
              No matches.
            </div>
          ) : (
            filteredPersons.map((p) => {
              const isSelected = selectedPersonId === p.entity_id;
              return (
                <button
                  key={p.entity_id}
                  onClick={() => selectPerson(p.entity_id)}
                  className="w-full text-left px-4 py-2.5 transition-colors group"
                  style={{
                    borderBottom: `1px solid ${alpha(theme.bone, 5)}`,
                    background: isSelected
                      ? `linear-gradient(90deg, ${alpha(theme.ember, 18)}, ${alpha(theme.ember, 4)})`
                      : "transparent",
                    borderLeft: isSelected ? `2px solid ${theme.ember}` : "2px solid transparent",
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="text-sm leading-snug min-w-0 truncate"
                      style={{
                        fontFamily: "var(--font-fraunces), serif",
                        color: isSelected ? theme.bone : alpha(theme.bone, 88),
                        fontWeight: isSelected ? 500 : 400,
                      }}
                    >
                      {p.name}
                    </p>
                    {p.importance > 0 && (
                      <span
                        className="text-[10px] font-mono shrink-0 mt-1"
                        style={{ color: isSelected ? theme.ember : alpha(theme.bone, 30) }}
                      >
                        {p.importance}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[11px] mt-0.5 leading-snug line-clamp-1 font-mono"
                    style={{ color: alpha(theme.bone, 40) }}
                  >
                    {[p.nationality, ...p.occupations.slice(0, 2)].filter(Boolean).join(" · ")}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div
            className="text-center rounded-xl px-8 py-6 max-w-sm"
            style={{
              background: alpha(theme.surface, 92),
              border: `1px solid ${alpha(theme.bone, 10)}`,
            }}
          >
            <p
              className="text-base mb-2"
              style={{ fontFamily: "var(--font-fraunces), serif", color: theme.ember }}
            >
              No data yet
            </p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: alpha(theme.bone, 55) }}>
              Apply migration 016 and run the loader:
            </p>
            <pre
              className="text-left rounded-lg p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap"
              style={{ background: alpha(theme.ink, 70), color: theme.steel }}
            >
{`pnpm epstein:import-curated \\
  --repo-path ../epstein-network-data`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dual-range slider (two thumbs)
// ---------------------------------------------------------------------------

function DualRange({
  min,
  max,
  value,
  onChange,
  theme,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  theme: EpsteinTheme;
}) {
  // Thumb uses CSS variables emitted by the parent root so theme changes flow
  // through without rebuilding the Tailwind class string at runtime.
  const thumbClass =
    "absolute inset-0 w-full appearance-none bg-transparent pointer-events-none " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none " +
    "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:bg-(--vmy-ember) [&::-webkit-slider-thumb]:cursor-pointer " +
    "[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_var(--vmy-ink),0_0_8px_var(--vmy-ember)] " +
    "[&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-(--vmy-ember) [&::-moz-range-thumb]:border-0 " +
    "[&::-moz-range-thumb]:cursor-pointer";
  return (
    <div className="relative h-4">
      <div
        className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 rounded-full"
        style={{ background: `color-mix(in srgb, ${theme.bone} 15%, transparent)` }}
      />
      <div
        className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
        style={{
          left: `${((value[0] - min) / (max - min)) * 100}%`,
          right: `${100 - ((value[1] - min) / (max - min)) * 100}%`,
          background: `linear-gradient(90deg, ${theme.ember}, ${theme.steel})`,
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value[0]}
        onChange={(e) => onChange([Math.min(Number(e.target.value), value[1]), value[1]])}
        className={thumbClass}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value[1]}
        onChange={(e) => onChange([value[0], Math.max(Number(e.target.value), value[0])])}
        className={thumbClass}
      />
    </div>
  );
}
