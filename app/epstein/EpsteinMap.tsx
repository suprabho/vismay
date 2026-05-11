"use client";

import { useCallback, useMemo, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { Map as MapboxMap } from "react-map-gl/mapbox";
import { DeckGL } from "@deck.gl/react";
import { FlyToInterpolator } from "deck.gl";
import { ScatterplotLayer, TextLayer, ArcLayer } from "@deck.gl/layers";

import type { Airport, Flight, BlackbookPoint, PersonSummary } from "./page";
import PersonDetail from "./PersonDetail";

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

const C_AIRPORT: [number, number, number, number] = [255, 150, 30, 220];
const C_ARC_FROM: [number, number, number] = [255, 150, 30];
const C_ARC_TO: [number, number, number] = [80, 160, 255];
const C_BLACKBOOK: [number, number, number, number] = [200, 80, 200, 180];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LayerVisibility = { flights: boolean; airports: boolean; blackbook: boolean };

interface Props {
  airports: Airport[];
  flights: Flight[];
  blackbook: BlackbookPoint[];
  persons: PersonSummary[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EpsteinMap({ airports, flights, blackbook, persons }: Props) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [yearRange, setYearRange] = useState<[number, number]>([1991, 1994]);
  const [visible, setVisible] = useState<LayerVisibility>({
    flights: true, airports: true, blackbook: false,
  });
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  // flight_ids the selected person appears on (loaded by PersonDetail and lifted up)
  const [personFlightIds, setPersonFlightIds] = useState<Set<number> | null>(null);
  // blackbook ids linked to the selected person (lifted from PersonDetail)
  const [personBlackbookIds, setPersonBlackbookIds] = useState<Set<number> | null>(null);
  const [hoveredAirport, setHoveredAirport] = useState<Airport | null>(null);
  const [hoveredBlackbook, setHoveredBlackbook] = useState<BlackbookPoint | null>(null);
  const [personQuery, setPersonQuery] = useState("");

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
      // Flatten multi-leg into segments. PSP→CLE→CMH means from=['PSP','CLE'] to=['CMH'],
      // so the full leg list is [PSP, CLE, CMH].
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

  // Airports with positive traffic in the current year window
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
    // If a person is selected and we have their blackbook ids loaded, show
    // those entries only (regardless of the toggle — it's part of the focused
    // view). Otherwise honor the visibility toggle.
    if (personBlackbookIds && personBlackbookIds.size > 0) {
      return blackbook.filter((b) => personBlackbookIds.has(b.id));
    }
    return visible.blackbook ? blackbook : [];
  }, [blackbook, visible.blackbook, personBlackbookIds]);

  // -------------------------------------------------------------------------
  // Layers
  // -------------------------------------------------------------------------

  const arcLayer = new ArcLayer({
    id: "flight-arcs",
    data: visible.flights ? arcs : [],
    getSourcePosition: (d: any) => d.from,
    getTargetPosition: (d: any) => d.to,
    getSourceColor: C_ARC_FROM,
    getTargetColor: C_ARC_TO,
    getWidth: 1.2,
    greatCircle: true,
    pickable: false,
    opacity: 0.55,
  });

  const airportLayer = new ScatterplotLayer<Airport>({
    id: "airports",
    data: visible.airports ? activeAirports : [],
    getPosition: (d) => [d.lng, d.lat],
    getRadius: (d) => Math.sqrt(d.traffic / maxTraffic) * 50_000 + 8_000,
    radiusUnits: "meters",
    radiusMinPixels: 4,
    radiusMaxPixels: 28,
    getFillColor: C_AIRPORT,
    getLineColor: [255, 200, 100, 200],
    lineWidthMinPixels: 1,
    stroked: true,
    pickable: true,
    onHover: ({ object }) => setHoveredAirport(object ?? null),
  });

  const airportLabelLayer = new TextLayer<Airport>({
    id: "airport-labels",
    data: visible.airports ? activeAirports.filter((a) => a.traffic >= maxTraffic * 0.25) : [],
    getPosition: (d) => [d.lng, d.lat],
    getText: (d) => d.iata,
    getSize: 11,
    getColor: [255, 200, 140, 240],
    getBackgroundColor: [0, 0, 0, 180],
    background: true,
    backgroundPadding: [4, 2, 4, 2],
    fontFamily: "monospace",
    getTextAnchor: "middle",
    getAlignmentBaseline: "bottom",
    getPixelOffset: [0, -10],
  });

  const blackbookLayer = new ScatterplotLayer<BlackbookPoint>({
    id: "blackbook",
    data: filteredBlackbook,
    getPosition: (d) => [d.lng, d.lat],
    // Slightly larger when filtered to a person — these are the focal points.
    getRadius: personBlackbookIds ? 8_000 : 4_000,
    radiusUnits: "meters",
    radiusMinPixels: personBlackbookIds ? 4 : 2,
    radiusMaxPixels: personBlackbookIds ? 10 : 6,
    getFillColor: C_BLACKBOOK,
    getLineColor: [255, 220, 255, 220],
    lineWidthMinPixels: 1,
    stroked: true,
    pickable: true,
    onHover: ({ object }) => setHoveredBlackbook(object ?? null),
  });

  const blackbookLabelLayer = new TextLayer<BlackbookPoint>({
    id: "blackbook-labels",
    // Only label when filtered to a person — otherwise the map gets unreadable.
    data: personBlackbookIds ? filteredBlackbook : [],
    getPosition: (d) => [d.lng, d.lat],
    getText: (d) => d.city ?? d.name,
    getSize: 10,
    getColor: [240, 200, 240, 240],
    getBackgroundColor: [0, 0, 0, 180],
    background: true,
    backgroundPadding: [4, 2, 4, 2],
    fontFamily: "monospace",
    getTextAnchor: "middle",
    getAlignmentBaseline: "top",
    getPixelOffset: [0, 10],
  });

  const layers = [blackbookLayer, blackbookLabelLayer, arcLayer, airportLayer, airportLabelLayer];

  // -------------------------------------------------------------------------
  // Person selection — PersonDetail loads their flights and reports back so
  // we can filter the map and fly to the bounding box of their airports.
  // -------------------------------------------------------------------------

  function selectPerson(personId: string) {
    setSelectedPersonId(personId);
    setPersonFlightIds(null);
    setPersonBlackbookIds(null);
  }

  function clearPerson() {
    setSelectedPersonId(null);
    setPersonFlightIds(null);
    setPersonBlackbookIds(null);
  }

  // Stable identity across re-renders so PersonDetail's useEffect doesn't refetch
  // every time the year slider or layer toggle changes.
  const handlePersonDataLoaded = useCallback(
    (
      personId: string,
      flightIds: number[],
      iataCodes: string[],
      blackbookIds: number[]
    ) => {
      // Race guard: a slower response from a previously selected person
      // shouldn't override the current selection.
      if (personId !== selectedPersonId) return;

      setPersonFlightIds(new Set(flightIds));
      setPersonBlackbookIds(new Set(blackbookIds));

      // Fit the camera to the union of the person's flight airports and the
      // blackbook locations they're tied to.
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
      setViewState((v) => ({
        ...v,
        longitude: (minLng + maxLng) / 2,
        latitude: (minLat + maxLat) / 2,
        zoom: Math.max(2, Math.min(5, 6 - Math.log2(Math.max(span, 1)))),
        transitionDuration: 900,
        transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
      } as typeof v));
    },
    [selectedPersonId, airportByCode, blackbook]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const hasData = airports.length > 0 || flights.length > 0;

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }: { viewState: unknown }) =>
          setViewState(vs as typeof viewState)
        }
        controller={{ doubleClickZoom: false }}
        layers={layers}
        style={{ position: "absolute", inset: "0" }}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      >
        <MapboxMap
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          projection="globe"
        />
      </DeckGL>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      {/* Right padding clears the 320px right sidebar so the layer toggle stays visible. */}
      <div className="absolute top-0 left-0 right-80 z-10 px-5 py-3.5 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent pointer-events-none">
        <div>
          <h1 className="text-sm font-mono font-bold tracking-widest uppercase text-orange-400 leading-tight">
            Epstein Flight Network
          </h1>
          <p className="text-xs text-white/40 mt-0.5 font-mono">
            {arcs.length} legs · {activeAirports.length} airports · {persons.length} people
          </p>
        </div>

        <div className="pointer-events-auto flex gap-1 bg-black/70 border border-white/10 rounded-full p-1">
          {(["flights", "airports", "blackbook"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setVisible((v) => ({ ...v, [k]: !v[k] }))}
              className={`px-3 py-1 rounded-full text-xs font-mono transition-colors ${
                visible[k] ? "bg-orange-500 text-black" : "text-white/50 hover:text-white"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {/* ── Year slider ──────────────────────────────────────────────────── */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-10 pointer-events-auto bg-black/85 border border-white/10 rounded-xl px-4 py-3 backdrop-blur w-[420px]">
        <div className="flex items-center justify-between text-xs font-mono text-white/50 mb-1.5">
          <span>Years</span>
          <span className="text-orange-400">{yearRange[0]} – {yearRange[1]}</span>
        </div>
        <DualRange
          min={1991}
          max={1994}
          value={yearRange}
          onChange={setYearRange}
        />
        <p className="text-[10px] text-white/30 font-mono mt-1.5 leading-snug">
          Coverage: pages 1–31 of the flight logs (1991–1994 of 1991–2019).
          {personFlightIds &&
            ` Filtered to ${personFlightIds.size} flight${personFlightIds.size === 1 ? "" : "s"}.`}
        </p>
      </div>

      {/* ── Hover airport tooltip ────────────────────────────────────────── */}
      {hoveredAirport && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-black/85 border border-orange-500/30 rounded px-3 py-1.5 text-xs font-mono text-orange-300 pointer-events-none whitespace-nowrap">
          {hoveredAirport.iata} — {hoveredAirport.full_name ?? hoveredAirport.city}
          {hoveredAirport.country ? `, ${hoveredAirport.country}` : ""}
          <span className="ml-2 text-white/40">{hoveredAirport.traffic} legs</span>
        </div>
      )}

      {/* ── Hover blackbook tooltip ──────────────────────────────────────── */}
      {hoveredBlackbook && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-black/85 border border-fuchsia-400/40 rounded px-3 py-1.5 text-xs font-mono text-fuchsia-200 pointer-events-none whitespace-nowrap">
          <span className="text-fuchsia-300">{hoveredBlackbook.name}</span>
          {(hoveredBlackbook.city || hoveredBlackbook.country) && (
            <span className="ml-2 text-white/50">
              {[hoveredBlackbook.city, hoveredBlackbook.country].filter(Boolean).join(", ")}
            </span>
          )}
        </div>
      )}

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 left-5 z-10 flex flex-col gap-1.5 pointer-events-none">
        {[
          { color: `rgb(${C_AIRPORT.slice(0, 3).join(",")})`, label: "Airport" },
          { color: `rgb(${C_ARC_FROM.join(",")})`, label: "Flight origin" },
          { color: `rgb(${C_ARC_TO.join(",")})`, label: "Flight dest." },
          { color: `rgb(${C_BLACKBOOK.slice(0, 3).join(",")})`, label: "Black Book" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border border-white/30" style={{ background: l.color }} />
            <span className="text-xs font-mono text-white/50">{l.label}</span>
          </div>
        ))}
      </div>

      {/* ── Person detail panel (left, lazy-loaded) ──────────────────────── */}
      {selectedPersonId && (
        <PersonDetail
          personId={selectedPersonId}
          person={persons.find((p) => p.entity_id === selectedPersonId)}
          onClose={clearPerson}
          onDataLoaded={handlePersonDataLoaded}
        />
      )}

      {/* ── Persons sidebar (right) ──────────────────────────────────────── */}
      <div className="absolute right-0 top-0 bottom-0 z-10 w-80 flex flex-col bg-black/75 backdrop-blur-sm border-l border-white/10 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex-shrink-0">
          <p className="text-xs font-mono uppercase tracking-widest text-white/40 mb-2">People</p>
          <input
            type="search"
            value={personQuery}
            onChange={(e) => setPersonQuery(e.target.value)}
            placeholder="Search…"
            className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-white placeholder:text-white/30 focus:border-orange-500/50 focus:outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredPersons.length === 0 ? (
            <div className="px-4 py-8 text-center text-white/30 text-xs font-mono">
              No matches.
            </div>
          ) : (
            filteredPersons.map((p) => (
              <button
                key={p.entity_id}
                onClick={() => selectPerson(p.entity_id)}
                className={`w-full text-left px-4 py-2.5 border-b border-white/5 transition-colors ${
                  selectedPersonId === p.entity_id ? "bg-orange-500/10" : "hover:bg-white/5"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-mono text-white leading-snug min-w-0">{p.name}</p>
                  {p.importance > 0 && (
                    <span className="text-[10px] font-mono text-white/30 flex-shrink-0 mt-px">
                      {p.importance}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/40 mt-0.5 leading-snug line-clamp-1">
                  {[p.nationality, ...p.occupations.slice(0, 2)].filter(Boolean).join(" · ")}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="text-center bg-black/85 border border-white/10 rounded-xl px-8 py-6 max-w-sm">
            <p className="text-orange-400 font-mono text-sm font-bold mb-2">No data yet</p>
            <p className="text-white/50 text-xs leading-relaxed mb-3">
              Apply migration 016 and run the loader:
            </p>
            <pre className="text-left bg-black/50 rounded-lg p-3 text-xs font-mono text-green-400 leading-relaxed whitespace-pre-wrap">
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
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  return (
    <div className="relative h-4">
      <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-white/15 rounded-full" />
      <div
        className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-orange-500 rounded-full"
        style={{
          left: `${((value[0] - min) / (max - min)) * 100}%`,
          right: `${100 - ((value[1] - min) / (max - min)) * 100}%`,
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value[0]}
        onChange={(e) => onChange([Math.min(Number(e.target.value), value[1]), value[1]])}
        className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:cursor-pointer"
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value[1]}
        onChange={(e) => onChange([value[0], Math.max(Number(e.target.value), value[0])])}
        className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>
  );
}
