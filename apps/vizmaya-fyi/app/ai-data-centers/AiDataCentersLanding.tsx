"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import { Map, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import VizmayaLogo from "@/components/VizmayaLogo";
import type { DcFacility, DcMetricKey, Epic, EpicStory } from "@vismay/content-source/epics";
import { applyMapPalette } from "@vismay/viz-engine";
import {
  aiDataCentersLogoPalette,
  aiDataCentersMapPalette,
  type AiDataCentersTheme,
} from "./theme";
import AiDataCenterDetail, {
  formatCapexBn,
  formatH100e,
  formatPowerMw,
} from "./AiDataCenterDetail";

interface Props {
  epic: Pick<Epic, "slug" | "name" | "description">;
  facilities: DcFacility[];
  stories: EpicStory[];
  theme: AiDataCentersTheme;
  mapStyle: string;
}

// Continental-US framing — every tracked frontier facility is in the US so
// far. If Epoch adds sites abroad they still render; users just pan/zoom out.
const INITIAL_VIEW_STATE = {
  longitude: -96.5,
  latitude: 38.5,
  zoom: 3.4,
};

const METRIC_OPTIONS: { key: DcMetricKey; label: string; format: (v: number) => string }[] = [
  { key: "power_mw", label: "Power", format: formatPowerMw },
  { key: "h100_equivalents", label: "Compute", format: formatH100e },
  { key: "capex_usd_bn", label: "Capital", format: formatCapexBn },
];

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

function metricValue(f: DcFacility, metric: DcMetricKey): number | null {
  switch (metric) {
    case "power_mw": return f.powerMw;
    case "h100_equivalents": return f.h100Equivalents;
    case "capex_usd_bn": return f.capexUsdBn;
  }
}

export default function AiDataCentersLanding({ epic, facilities, stories, theme, mapStyle }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [hoveredSlug, setHoveredSlug] = useState<string | null>(null);
  const [metric, setMetric] = useState<DcMetricKey>("power_mw");
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");

  const logoPalette = useMemo(() => aiDataCentersLogoPalette(theme), [theme]);
  const mapPalette = useMemo(() => aiDataCentersMapPalette(theme), [theme]);
  const metricOption = METRIC_OPTIONS.find((m) => m.key === metric)!;

  // Restyle the stock base-map layers to the epic palette — same poll-and-bind
  // pattern as EnergyProfileLanding (the ref may not exist on the first tick).
  useEffect(() => {
    let cancelled = false;
    let map: ReturnType<NonNullable<typeof mapRef.current>["getMap"]> | null = null;
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
      m.on("style.load", apply);
    };
    tryBind();
    return () => {
      cancelled = true;
      if (map) map.off("style.load", apply);
    };
  }, [mapPalette]);

  // Leaderboard: every facility ranked by the active metric (null values
  // sink). The map only shows facilities with coords; the list shows all.
  const ranked = useMemo(
    () =>
      [...facilities].sort((a, b) => (metricValue(b, metric) ?? -1) - (metricValue(a, metric) ?? -1)),
    [facilities, metric],
  );

  const mappable = useMemo(() => facilities.filter((f) => f.lat != null && f.lng != null), [facilities]);

  const maxMetric = useMemo(
    () => Math.max(1, ...mappable.map((f) => metricValue(f, metric) ?? 0)),
    [mappable, metric],
  );

  const pinsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: mappable.map((f) => {
        const v = metricValue(f, metric) ?? 0;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [f.lng!, f.lat!] },
          properties: {
            slug: f.slug,
            name: f.name,
            radius: 6 + Math.sqrt(v / maxMetric) * 18,
            label: v > 0 ? `${f.name} · ${metricOption.format(v)}` : f.name,
          },
        };
      }),
    }),
    [mappable, metric, maxMetric, metricOption],
  );

  const selectFacility = (f: DcFacility) => {
    setSelectedSlug(f.slug);
    if (f.lat != null && f.lng != null) {
      mapRef.current?.getMap().easeTo({
        center: [f.lng, f.lat],
        zoom: 5.5,
        duration: 900,
        essential: true,
      });
    }
  };

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{
        background: theme.ink,
        color: theme.bone,
        // CSS vars consumed by the shared DetailSheet + AiDataCenterDetail.
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
        mapStyle={mapStyle}
        attributionControl={false}
        doubleClickZoom={false}
        cursor={cursor}
        interactiveLayerIds={["dc-pin-core"]}
        onMouseMove={(e) => {
          const feat = e.features?.[0];
          const slug = feat?.properties?.slug as string | undefined;
          setHoveredSlug(slug ?? null);
          setCursor(feat ? "pointer" : "grab");
        }}
        onMouseLeave={() => {
          setHoveredSlug(null);
          setCursor("grab");
        }}
        onClick={(e) => {
          const feat = e.features?.[0];
          if (!feat) {
            setSelectedSlug(null);
            return;
          }
          const slug = feat.properties?.slug as string | undefined;
          const facility = slug ? facilities.find((f) => f.slug === slug) : undefined;
          if (facility) selectFacility(facility);
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Source id="dc-pins" type="geojson" data={pinsGeoJson}>
          <Layer
            id="dc-pin-halo"
            type="circle"
            paint={{
              "circle-radius": ["*", ["get", "radius"], 1.6],
              "circle-color": theme.accent,
              "circle-opacity": 0.12,
              "circle-pitch-alignment": "map",
            }}
          />
          <Layer
            id="dc-pin-core"
            type="circle"
            paint={{
              "circle-radius": ["get", "radius"],
              "circle-color": [
                "case",
                ["==", ["get", "slug"], selectedSlug ?? ""],
                theme.accentHi,
                ["==", ["get", "slug"], hoveredSlug ?? ""],
                theme.accentMid,
                theme.accent,
              ],
              "circle-opacity": 0.85,
              "circle-stroke-color": theme.accentEdge,
              "circle-stroke-width": 1,
              "circle-stroke-opacity": 0.9,
            }}
          />
          <Layer
            id="dc-pin-labels"
            type="symbol"
            layout={{
              "text-field": ["get", "label"],
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
              "text-size": 11,
              "text-offset": [0, -1.6],
              "text-anchor": "bottom",
              "text-allow-overlap": false,
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

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        className="absolute top-0 left-0 right-0 z-10 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-4 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${alpha(theme.ink, 95)} 0%, ${alpha(theme.ink, 70)} 60%, transparent 100%)`,
        }}
      >
        <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
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
            <p
              className="text-[11px] md:text-xs mt-0.5 font-mono uppercase tracking-[0.18em]"
              style={{ color: theme.muted }}
            >
              <span style={{ color: theme.accentHi }}>{facilities.length}</span> facilities tracked
            </p>
          </div>
        </div>

        {/* Metric toggle — drives both the pin sizing and the leaderboard sort. */}
        <div
          className="pointer-events-auto shrink-0 rounded-full p-0.5 flex text-[11px] font-mono uppercase tracking-wider"
          style={{
            background: alpha(theme.surface, 85),
            border: `1px solid ${alpha(theme.bone, 12)}`,
          }}
        >
          {METRIC_OPTIONS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className="px-3 py-1 rounded-full transition-colors"
              style={
                metric === m.key
                  ? { background: alpha(theme.accent, 20), color: theme.accentHi }
                  : { color: theme.muted }
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Leaderboard (desktop) ────────────────────────────────────────── */}
      <div
        className="hidden md:flex absolute right-4 top-24 bottom-28 z-10 w-[300px] flex-col rounded-xl overflow-hidden"
        style={{
          background: alpha(theme.surface, 88),
          border: `1px solid ${alpha(theme.bone, 10)}`,
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      >
        <div
          className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.22em] shrink-0"
          style={{ color: theme.muted, borderBottom: `1px solid ${alpha(theme.bone, 8)}` }}
        >
          Ranked by {metricOption.label.toLowerCase()}
        </div>
        <ol className="flex-1 overflow-y-auto">
          {ranked.map((f, i) => {
            const v = metricValue(f, metric);
            const active = f.slug === selectedSlug;
            return (
              <li key={f.slug}>
                <button
                  onClick={() => selectFacility(f)}
                  className="w-full text-left px-3 py-2 flex items-baseline gap-2 transition-colors"
                  style={{
                    background: active ? alpha(theme.accent, 12) : "transparent",
                    borderBottom: `1px solid ${alpha(theme.bone, 5)}`,
                  }}
                >
                  <span className="text-[10px] font-mono w-5 shrink-0" style={{ color: theme.muted }}>
                    {i + 1}
                  </span>
                  <span
                    className="text-xs truncate flex-1"
                    style={{ color: active ? theme.accentHi : alpha(theme.bone, 90) }}
                  >
                    {f.name}
                  </span>
                  <span className="text-[11px] font-mono shrink-0" style={{ color: theme.accentMid }}>
                    {v != null ? metricOption.format(v) : "—"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div
          className="px-3 py-2 text-[9px] font-mono leading-snug shrink-0"
          style={{ color: alpha(theme.bone, 35), borderTop: `1px solid ${alpha(theme.bone, 8)}` }}
        >
          Data:{" "}
          <a
            className="underline pointer-events-auto"
            href="https://epoch.ai/data/ai-data-centers"
            target="_blank"
            rel="noopener noreferrer"
          >
            Epoch AI, Frontier Data Centers
          </a>{" "}
          (CC BY 4.0)
        </div>
      </div>

      {/* Facility detail sheet — bottom sheet on mobile, left panel at md+. */}
      {selectedSlug && (
        <AiDataCenterDetail slug={selectedSlug} onClose={() => setSelectedSlug(null)} />
      )}

      {/* Stories rail */}
      <footer
        className="absolute left-0 right-0 bottom-0 z-10 px-6 py-4"
        style={{
          background: `linear-gradient(to top, ${alpha(theme.ink, 95)}, transparent)`,
        }}
      >
        <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: theme.muted }}>
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
                className="dc-story-chip shrink-0 px-3 py-2 rounded text-sm"
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
        .dc-story-chip:hover {
          border-color: ${alpha(theme.accentHi, 60)};
          color: ${theme.accentHi};
        }
      `}</style>
    </div>
  );
}
