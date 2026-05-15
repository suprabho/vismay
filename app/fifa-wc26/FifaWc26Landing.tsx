"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import { Map, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import VizmayaLogo from "@/components/VizmayaLogo";
import type { Epic, EpicStory } from "@/lib/epics";
import type { FifaWc26Team } from "@/lib/fifa-wc26";
import { applyMapPalette } from "@/lib/applyMapPalette";
import { fifaWc26LogoPalette, fifaWc26MapPalette, type FifaWc26Theme } from "./theme";
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

type ShadeMetric =
  | "squad"
  | "gdp"
  | "population"
  | "land"
  | "democracy"
  | "confederation"
  | "regime"
  | "debut";

const SHADE_OPTIONS: { value: ShadeMetric; label: string; group: "continuous" | "categorical" }[] = [
  { value: "squad", label: "Squad value", group: "continuous" },
  { value: "gdp", label: "GDP", group: "continuous" },
  { value: "population", label: "Population", group: "continuous" },
  { value: "land", label: "Land area", group: "continuous" },
  { value: "democracy", label: "Democracy index", group: "continuous" },
  { value: "confederation", label: "Confederation", group: "categorical" },
  { value: "regime", label: "Regime type", group: "categorical" },
  { value: "debut", label: "Debut", group: "categorical" },
];

const CONTINUOUS_SHADE_LABELS: Record<Extract<ShadeMetric, "squad" | "gdp" | "population" | "land" | "democracy">, { short: string; unit: string }> = {
  squad: { short: "Squad value", unit: "€mn" },
  gdp: { short: "GDP", unit: "$bn" },
  population: { short: "Population", unit: "mn" },
  land: { short: "Land area", unit: "km²" },
  democracy: { short: "Democracy", unit: "EIU" },
};

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

function pickShadeValue(t: FifaWc26Team, m: ShadeMetric): number | null {
  switch (m) {
    case "squad":
      return t.squadValueEurMn;
    case "gdp":
      return t.gdpNominalUsdBn;
    case "population":
      return t.populationMn;
    case "land":
      return t.landAreaSqKm;
    case "democracy":
      return t.eiuDemocracyIndex2024;
    default:
      return null;
  }
}

function categoricalColorFor(
  t: FifaWc26Team,
  m: Extract<ShadeMetric, "confederation" | "regime" | "debut">,
  theme: FifaWc26Theme,
): string {
  if (m === "confederation") return CONFEDERATION_HUES[t.confederation] ?? theme.ramp3;
  if (m === "regime") {
    if (!t.regimeType) return theme.accentLo;
    return REGIME_HUES[t.regimeType] ?? theme.accentLo;
  }
  return t.isDebut ? theme.ramp5 : theme.ramp3;
}

function isContinuousShade(m: ShadeMetric): boolean {
  return m === "squad" || m === "gdp" || m === "population" || m === "land" || m === "democracy";
}

function formatTick(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 10) return v.toFixed(0);
  return v.toFixed(1);
}

export default function FifaWc26Landing({ epic, teams, stories, theme }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");
  const [shadeMetric, setShadeMetric] = useState<ShadeMetric>("squad");
  const [activeConfeds, setActiveConfeds] = useState<Set<string>>(
    () => new Set(CONFEDERATIONS),
  );

  const logoPalette = useMemo(() => fifaWc26LogoPalette(theme), [theme]);
  const mapPalette = useMemo(() => fifaWc26MapPalette(theme), [theme]);

  // Restyle the stock dark-v11 base layers to match the epic palette. Polls
  // for the Mapbox instance, then binds to style.load.
  useEffect(() => {
    let cancelled = false;
    let map: ReturnType<NonNullable<typeof mapRef.current>['getMap']> | null = null;
    const apply = () => {
      if (cancelled || !map) return;
      const layers = map.getStyle()?.layers;
      if (!layers || layers.length === 0) return;
      applyMapPalette(map, mapPalette);
    };
    const tryBind = () => {
      if (cancelled) return;
      const m = mapRef.current?.getMap();
      if (!m) { setTimeout(tryBind, 50); return; }
      map = m;
      apply();
      m.on('style.load', apply);
    };
    tryBind();
    return () => {
      cancelled = true;
      if (map) map.off('style.load', apply);
    };
  }, [mapPalette]);

  const filteredTeams = useMemo(
    () => teams.filter((t) => activeConfeds.has(t.confederation)),
    [teams, activeConfeds],
  );

  // Teams that participate in the choropleth (must have an ISO-2; SCO is null).
  const teamsOnMap = useMemo(
    () => filteredTeams.filter((t) => !!t.isoA2),
    [filteredTeams],
  );

  const teamIsoCodes = useMemo(
    () => teamsOnMap.map((t) => t.isoA2 as string),
    [teamsOnMap],
  );

  // Look up a team by its ISO-2 (used by the click/hover handlers).
  const teamByIso = useMemo(() => {
    const m: Record<string, FifaWc26Team> = {};
    for (const t of teamsOnMap) if (t.isoA2) m[t.isoA2] = t;
    return m;
  }, [teamsOnMap]);

  const selectedIso = selectedCode
    ? (teams.find((t) => t.code === selectedCode)?.isoA2 ?? null)
    : null;

  // Build the continuous-ramp expression for the active shade metric. The
  // domain is the filtered teams' min/max so the ramp always uses its full
  // range, even when confederations are filtered.
  const fillExpression = useMemo(() => {
    if (isContinuousShade(shadeMetric)) {
      const pairs: Array<[string, number]> = [];
      let lo = Infinity;
      let hi = -Infinity;
      for (const t of teamsOnMap) {
        const v = pickShadeValue(t, shadeMetric);
        if (v == null || !t.isoA2) continue;
        pairs.push([t.isoA2, v]);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (pairs.length === 0 || !Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
        // Flat fallback — single solid colour at the mid stop.
        return theme.ramp3;
      }
      const valueExpr: (string | number | unknown[])[] = ["match", ["get", "iso_3166_1"]];
      for (const [iso, val] of pairs) {
        valueExpr.push(iso);
        valueExpr.push(val);
      }
      valueExpr.push(lo); // fallback for any country slipping through the layer filter
      const span = hi - lo;
      const stops = [
        { v: lo, c: theme.ramp1 },
        { v: lo + span * 0.25, c: theme.ramp2 },
        { v: lo + span * 0.5, c: theme.ramp3 },
        { v: lo + span * 0.75, c: theme.ramp4 },
        { v: hi, c: theme.ramp5 },
      ];
      const expr: (string | number | unknown[])[] = ["interpolate", ["linear"], valueExpr];
      for (const s of stops) {
        expr.push(s.v);
        expr.push(s.c);
      }
      return expr;
    }
    // Categorical: build a match expression from iso_3166_1 → per-team hue.
    const categorical = shadeMetric as Extract<ShadeMetric, "confederation" | "regime" | "debut">;
    const expr: (string | number | unknown[])[] = ["match", ["get", "iso_3166_1"]];
    for (const t of teamsOnMap) {
      if (!t.isoA2) continue;
      expr.push(t.isoA2);
      expr.push(categoricalColorFor(t, categorical, theme));
    }
    expr.push(theme.ramp1);
    return expr;
  }, [shadeMetric, teamsOnMap, theme]);

  // One label point per team, anchored at the imported country centroid
  // (team.lat/lng). The country_boundaries tileset is split into many sub-
  // features per country (one per island / coastline segment), so painting
  // symbols off that source duplicates the label hundreds of times for
  // archipelagic nations like Japan.
  const labelsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: teamsOnMap.map((t) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [t.lng, t.lat] },
        properties: { iso: t.isoA2, name: t.name },
      })),
    }),
    [teamsOnMap],
  );

  const continuousDomain = useMemo(() => {
    if (!isContinuousShade(shadeMetric)) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of teamsOnMap) {
      const v = pickShadeValue(t, shadeMetric);
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) return null;
    return { lo, hi };
  }, [shadeMetric, teamsOnMap]);

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
    setShadeMetric("squad");
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

  // Legend buckets shown beneath the controls. Continuous shade modes use the
  // ramp gradient swatch; categorical modes mirror the discrete pin palette.
  const legend = useMemo(() => {
    if (isContinuousShade(shadeMetric)) {
      const stops = [theme.ramp1, theme.ramp2, theme.ramp3, theme.ramp4, theme.ramp5];
      const labels =
        CONTINUOUS_SHADE_LABELS[shadeMetric as keyof typeof CONTINUOUS_SHADE_LABELS];
      return {
        kind: "continuous" as const,
        stops,
        unit: labels.unit,
        title: labels.short,
        lo: continuousDomain?.lo ?? null,
        hi: continuousDomain?.hi ?? null,
      };
    }
    if (shadeMetric === "confederation") {
      return {
        kind: "categorical" as const,
        items: CONFEDERATIONS.map((c) => ({ label: c, color: CONFEDERATION_HUES[c] })),
      };
    }
    if (shadeMetric === "regime") {
      return {
        kind: "categorical" as const,
        items: [
          { label: "Full democracy", color: REGIME_HUES["Full democracy"] },
          { label: "Flawed democracy", color: REGIME_HUES["Flawed democracy"] },
          { label: "Hybrid regime", color: REGIME_HUES["Hybrid regime"] },
          { label: "Authoritarian regime", color: REGIME_HUES["Authoritarian regime"] },
          { label: "No data", color: theme.accentLo },
        ],
      };
    }
    return {
      kind: "categorical" as const,
      items: [
        { label: "Returning", color: theme.ramp3 },
        { label: "Debut", color: theme.ramp5 },
      ],
    };
  }, [shadeMetric, continuousDomain, theme]);

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
        interactiveLayerIds={["wc26-country-fill"]}
        onMouseMove={(e) => {
          const feat = e.features?.[0];
          const iso = feat?.properties?.iso_3166_1 as string | undefined;
          setHoveredIso(iso ?? null);
          setCursor(feat ? "pointer" : "grab");
        }}
        onMouseLeave={() => {
          setHoveredIso(null);
          setCursor("grab");
        }}
        onClick={(e) => {
          const feat = e.features?.[0];
          if (!feat) {
            setSelectedCode(null);
            return;
          }
          const iso = feat.properties?.iso_3166_1 as string | undefined;
          if (!iso) return;
          const team = teamByIso[iso];
          if (team) selectTeam(team.code);
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Source
          id="wc26-country-boundaries"
          type="vector"
          url="mapbox://mapbox.country-boundaries-v1"
        >
          <Layer
            id="wc26-country-fill"
            type="fill"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", teamIsoCodes]]}
            paint={{
              "fill-color": fillExpression as never,
              "fill-opacity": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedIso ?? ""],
                0.85,
                ["==", ["get", "iso_3166_1"], hoveredIso ?? ""],
                0.7,
                0.55,
              ],
            }}
          />
          <Layer
            id="wc26-country-outline"
            type="line"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", teamIsoCodes]]}
            paint={{
              "line-color": theme.accentHi,
              "line-width": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedIso ?? ""],
                1.6,
                ["==", ["get", "iso_3166_1"], hoveredIso ?? ""],
                1.0,
                0.5,
              ],
              "line-opacity": 0.7,
            }}
          />
        </Source>

        <Source id="wc26-team-labels" type="geojson" data={labelsGeoJson}>
          <Layer
            id="wc26-country-label"
            type="symbol"
            filter={[
              "any",
              ["==", ["get", "iso"], selectedIso ?? ""],
              ["==", ["get", "iso"], hoveredIso ?? ""],
            ]}
            layout={{
              "text-field": ["get", "name"],
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
              "text-size": 12,
              "text-anchor": "center",
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
              {teamsOnMap.length} / {teams.length}
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
          {teamsOnMap.length} of {teams.length} teams
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
              Shade by
            </div>
            <select
              value={shadeMetric}
              onChange={(e) => setShadeMetric(e.target.value as ShadeMetric)}
              className="w-full text-xs px-2 py-1.5 rounded outline-none"
              style={{
                background: alpha(theme.elevated, 60),
                border: `1px solid ${theme.line}`,
                color: theme.bone,
              }}
            >
              <optgroup label="Continuous">
                {SHADE_OPTIONS.filter((o) => o.group === "continuous").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Categorical">
                {SHADE_OPTIONS.filter((o) => o.group === "categorical").map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
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
            {legend.kind === "continuous" ? (
              <div>
                <div
                  className="h-2 rounded-full"
                  style={{
                    background: `linear-gradient(to right, ${legend.stops.join(", ")})`,
                    border: `1px solid ${alpha(theme.bone, 10)}`,
                  }}
                />
                <div className="flex justify-between mt-1 text-[10px] font-mono" style={{ color: alpha(theme.bone, 65) }}>
                  <span>{legend.lo != null ? `${formatTick(legend.lo)} ${legend.unit}` : "—"}</span>
                  <span>{legend.hi != null ? `${formatTick(legend.hi)} ${legend.unit}` : "—"}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {legend.items.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: item.color, border: `1px solid ${theme.accentEdge}` }}
                    />
                    <span className="text-[11px]" style={{ color: alpha(theme.bone, 70) }}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
