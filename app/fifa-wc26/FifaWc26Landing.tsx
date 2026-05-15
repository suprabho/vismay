"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import { Map, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import VizmayaLogo from "@/components/VizmayaLogo";
import type { Epic, EpicStory } from "@/lib/epics";
import type { FifaWc26Team } from "@/lib/fifa-wc26";
import { fifaWc26LogoPalette, type FifaWc26Theme } from "./theme";
import TeamDetail from "./TeamDetail";

interface Props {
  epic: Epic;
  teams: FifaWc26Team[];
  stories: EpicStory[];
  theme: FifaWc26Theme;
}

const INITIAL_VIEW_STATE = {
  longitude: 10,
  latitude: 20,
  zoom: 1.3,
};

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

type SizeMetric = "squad" | "gdp" | "population" | "land";
type ColorMetric = "confederation" | "regime" | "debut";

const SIZE_OPTIONS: { value: SizeMetric; label: string }[] = [
  { value: "squad", label: "Squad value" },
  { value: "gdp", label: "GDP" },
  { value: "population", label: "Population" },
  { value: "land", label: "Land area" },
];

const COLOR_OPTIONS: { value: ColorMetric; label: string }[] = [
  { value: "confederation", label: "Confederation" },
  { value: "regime", label: "Regime type" },
  { value: "debut", label: "Debut" },
];

const CONFEDERATIONS = [
  "UEFA",
  "CONMEBOL",
  "CAF",
  "AFC",
  "CONCACAF",
  "OFC",
] as const;

const CONFEDERATION_HUES: Record<string, string> = {
  UEFA: "#4cb46a",
  CONMEBOL: "#f0c64b",
  CAF: "#e08a3c",
  AFC: "#5aa3e0",
  CONCACAF: "#c25fb6",
  OFC: "#7ad6c3",
};

const REGIME_HUES: Record<string, string> = {
  "Full democracy": "#4cb46a",
  "Flawed democracy": "#f0c64b",
  "Hybrid regime": "#e08a3c",
  "Authoritarian regime": "#c44a4a",
};

function pickMetric(t: FifaWc26Team, m: SizeMetric): number | null {
  switch (m) {
    case "squad":
      return t.squadValueEurMn;
    case "gdp":
      return t.gdpNominalUsdBn;
    case "population":
      return t.populationMn;
    case "land":
      return t.landAreaSqKm;
  }
}

function colorFor(t: FifaWc26Team, m: ColorMetric, theme: FifaWc26Theme): string {
  if (m === "confederation") {
    return CONFEDERATION_HUES[t.confederation] ?? theme.accent;
  }
  if (m === "regime") {
    if (!t.regimeType) return theme.accentLo;
    return REGIME_HUES[t.regimeType] ?? theme.accentLo;
  }
  // debut
  return t.isDebut ? theme.accentHi : theme.accent;
}

export default function FifaWc26Landing({ epic, teams, stories, theme }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");
  const [sizeMetric, setSizeMetric] = useState<SizeMetric>("squad");
  const [colorMetric, setColorMetric] = useState<ColorMetric>("confederation");
  const [activeConfeds, setActiveConfeds] = useState<Set<string>>(
    () => new Set(CONFEDERATIONS),
  );

  const logoPalette = useMemo(() => fifaWc26LogoPalette(theme), [theme]);

  const filteredTeams = useMemo(
    () => teams.filter((t) => activeConfeds.has(t.confederation)),
    [teams, activeConfeds],
  );

  const maxMetric = useMemo(() => {
    let m = 1;
    for (const t of filteredTeams) {
      const v = pickMetric(t, sizeMetric);
      if (v != null && v > m) m = v;
    }
    return m;
  }, [filteredTeams, sizeMetric]);

  const pinsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: filteredTeams.map((t) => {
        const v = pickMetric(t, sizeMetric) ?? 0;
        const ratio = Math.max(0, Math.min(1, v / maxMetric));
        const radius = 5 + Math.sqrt(ratio) * 14;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [t.lng, t.lat] },
          properties: {
            code: t.code,
            name: t.name,
            radius,
            fill: colorFor(t, colorMetric, theme),
            label: t.name,
          },
        };
      }),
    }),
    [filteredTeams, sizeMetric, colorMetric, maxMetric, theme],
  );

  const toggleConfed = (c: string) => {
    setActiveConfeds((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      // never let user filter out every confederation
      if (next.size === 0) return prev;
      return next;
    });
  };

  const resetFilters = () => {
    setActiveConfeds(new Set(CONFEDERATIONS));
    setSizeMetric("squad");
    setColorMetric("confederation");
  };

  const selectTeam = (code: string) => {
    setSelectedCode(code);
    const t = teams.find((x) => x.code === code);
    if (t) {
      mapRef.current?.getMap().easeTo({
        center: [t.lng, t.lat],
        zoom: 3.2,
        duration: 900,
        essential: true,
      });
    }
  };

  // Legend buckets shown beneath the controls.
  const legendItems = useMemo(() => {
    if (colorMetric === "confederation") {
      return CONFEDERATIONS.map((c) => ({ label: c, color: CONFEDERATION_HUES[c] }));
    }
    if (colorMetric === "regime") {
      return [
        { label: "Full democracy", color: REGIME_HUES["Full democracy"] },
        { label: "Flawed democracy", color: REGIME_HUES["Flawed democracy"] },
        { label: "Hybrid regime", color: REGIME_HUES["Hybrid regime"] },
        { label: "Authoritarian regime", color: REGIME_HUES["Authoritarian regime"] },
        { label: "No data", color: theme.accentLo },
      ];
    }
    return [
      { label: "Returning", color: theme.accent },
      { label: "Debut", color: theme.accentHi },
    ];
  }, [colorMetric, theme]);

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{
        background: theme.ink,
        color: theme.bone,
        "--vmy-surface": theme.surface,
        "--vmy-bone": theme.bone,
        "--vmy-ember": theme.accent,
        "--vmy-ink": theme.ink,
      } as CSSProperties}
    >
      <Map
        ref={mapRef}
        reuseMaps
        initialViewState={INITIAL_VIEW_STATE}
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection="globe"
        attributionControl={false}
        doubleClickZoom={false}
        cursor={cursor}
        interactiveLayerIds={["wc26-pin"]}
        onMouseMove={(e) => {
          const feat = e.features?.[0];
          const code = feat?.properties?.code as string | undefined;
          setHoveredCode(code ?? null);
          setCursor(feat ? "pointer" : "grab");
        }}
        onMouseLeave={() => {
          setHoveredCode(null);
          setCursor("grab");
        }}
        onClick={(e) => {
          const feat = e.features?.[0];
          if (!feat) {
            setSelectedCode(null);
            return;
          }
          const code = feat.properties?.code as string | undefined;
          if (code) selectTeam(code);
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Source id="wc26-pins" type="geojson" data={pinsGeoJson}>
          <Layer
            id="wc26-pin"
            type="circle"
            paint={{
              "circle-radius": ["get", "radius"],
              "circle-color": [
                "case",
                ["==", ["get", "code"], selectedCode ?? ""],
                theme.accentHi,
                ["==", ["get", "code"], hoveredCode ?? ""],
                theme.accentMid,
                ["get", "fill"],
              ],
              "circle-opacity": 0.92,
              "circle-stroke-color": theme.accentEdge,
              "circle-stroke-width": 1,
              "circle-stroke-opacity": 0.85,
            }}
          />
          <Layer
            id="wc26-pin-label"
            type="symbol"
            filter={[
              "any",
              ["==", ["get", "code"], selectedCode ?? ""],
              ["==", ["get", "code"], hoveredCode ?? ""],
            ]}
            layout={{
              "text-field": ["get", "label"],
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
              "text-size": 11,
              "text-offset": [0, -1.6],
              "text-anchor": "bottom",
              "text-allow-overlap": true,
            }}
            paint={{
              "text-color": theme.accentEdge,
              "text-halo-color": theme.ink,
              "text-halo-width": 1.5,
              "text-halo-blur": 0.5,
            }}
          />
        </Source>
      </Map>

      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-10 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-4 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${alpha(theme.ink, 95)} 0%, ${alpha(theme.ink, 70)} 60%, transparent 100%)`,
        }}
      >
        <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
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
            <div
              className="md:hidden pointer-events-auto shrink-0 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wider"
              style={{
                background: alpha(theme.surface, 85),
                border: `1px solid ${alpha(theme.bone, 12)}`,
                color: theme.accentHi,
              }}
            >
              {filteredTeams.length} / {teams.length}
            </div>
          </div>
          <div className="min-w-0">
            <h1
              className="text-base md:text-lg leading-tight tracking-tight"
              style={{ fontFamily: "var(--font-fraunces), serif", color: theme.bone, fontWeight: 500 }}
            >
              {epic.name}
            </h1>
            {epic.description && (
              <p className="mt-0.5 text-[11px] md:text-xs max-w-xl" style={{ color: theme.muted }}>
                {epic.description}
              </p>
            )}
          </div>
        </div>

        <div
          className="hidden md:flex pointer-events-auto shrink-0 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wider"
          style={{
            background: alpha(theme.surface, 85),
            border: `1px solid ${alpha(theme.bone, 12)}`,
            color: theme.accentHi,
          }}
        >
          {filteredTeams.length} of {teams.length} teams
        </div>
      </div>

      {/* Controls panel */}
      <div
        className="absolute z-10 pointer-events-auto rounded-xl backdrop-blur p-3 md:p-4 right-3 left-3 bottom-[150px] md:left-auto md:right-4 md:top-24 md:bottom-auto md:w-[260px]"
        style={{
          background: alpha(theme.surface, 88),
          border: `1px solid ${alpha(theme.bone, 12)}`,
          color: theme.bone,
        }}
      >
        <div className="space-y-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1.5" style={{ color: theme.muted }}>
              Size by
            </div>
            <select
              value={sizeMetric}
              onChange={(e) => setSizeMetric(e.target.value as SizeMetric)}
              className="w-full text-xs px-2 py-1.5 rounded outline-none"
              style={{
                background: alpha(theme.elevated, 60),
                border: `1px solid ${theme.line}`,
                color: theme.bone,
              }}
            >
              {SIZE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1.5" style={{ color: theme.muted }}>
              Color by
            </div>
            <select
              value={colorMetric}
              onChange={(e) => setColorMetric(e.target.value as ColorMetric)}
              className="w-full text-xs px-2 py-1.5 rounded outline-none"
              style={{
                background: alpha(theme.elevated, 60),
                border: `1px solid ${theme.line}`,
                color: theme.bone,
              }}
            >
              {COLOR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1.5" style={{ color: theme.muted }}>
              Confederations
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CONFEDERATIONS.map((c) => {
                const on = activeConfeds.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleConfed(c)}
                    className="text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded transition-opacity"
                    style={{
                      background: on ? alpha(CONFEDERATION_HUES[c], 30) : alpha(theme.elevated, 50),
                      border: `1px solid ${on ? CONFEDERATION_HUES[c] : theme.line}`,
                      color: on ? theme.bone : alpha(theme.bone, 50),
                    }}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1.5" style={{ color: theme.muted }}>
              Legend
            </div>
            <div className="space-y-1">
              {legendItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: item.color, border: `1px solid ${theme.accentEdge}` }}
                  />
                  <span className="text-[11px]" style={{ color: alpha(theme.bone, 70) }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={resetFilters}
            className="w-full text-[10px] font-mono uppercase tracking-wider py-1.5 rounded transition-opacity hover:opacity-80"
            style={{
              background: alpha(theme.elevated, 40),
              border: `1px solid ${theme.line}`,
              color: alpha(theme.bone, 70),
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Team detail sheet */}
      {selectedCode && (
        <TeamDetail code={selectedCode} onClose={() => setSelectedCode(null)} />
      )}

      {/* Stories rail */}
      <footer
        className="absolute left-0 right-0 bottom-0 z-10 px-6 py-4"
        style={{
          background: `linear-gradient(to top, ${alpha(theme.ink, 95)}, transparent)`,
        }}
      >
        <div
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: theme.muted }}
        >
          vizmaya stories
        </div>
        {stories.length === 0 ? (
          <p className="text-xs" style={{ color: alpha(theme.muted, 70) }}>
            No stories assigned to this epic yet.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {stories.map((s) => (
              <Link
                key={s.slug}
                href={`/story/${s.slug}`}
                className="wc26-story-chip shrink-0 px-3 py-2 rounded text-sm"
                style={{
                  border: `1px solid ${theme.line}`,
                  color: alpha(theme.bone, 85),
                  background: alpha(theme.surface, 60),
                }}
              >
                {s.title}
              </Link>
            ))}
          </div>
        )}
      </footer>

      <style jsx>{`
        .wc26-story-chip:hover {
          border-color: ${alpha(theme.accentHi, 60)};
          color: ${theme.accentHi};
        }
      `}</style>
    </div>
  );
}
