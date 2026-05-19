"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import type mapboxgl from "mapbox-gl";
import { Map, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import VizmayaLogo from "@/components/VizmayaLogo";
import { applyMapPalette } from "@vismay/viz-engine";
import type { Epic, EpicStory } from "@vismay/content-source/epics";
import type { WalletGeoSummary } from "@/lib/wallet-geo/data";
import {
  walletGeoChoroplethStops,
  walletGeoLogoPalette,
  walletGeoMapPalette,
  type WalletGeoTheme,
} from "./theme";
import CountryDetail from "./CountryDetail";

interface Props {
  epic: Epic;
  summaries: WalletGeoSummary[];
  stories: EpicStory[];
  theme: WalletGeoTheme;
}

const INITIAL_VIEW_STATE = {
  longitude: 30,
  latitude: 22,
  zoom: 1.3,
};

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

// Volume buckets for the choropleth legend. Mirrored in the Mapbox `step`
// expression below. Tweaking thresholds here propagates to both the legend
// chip and the map paint.
const BUCKETS: { min: number; max: number | null; label: string }[] = [
  { min: 0,      max: 5_000,   label: "< 5k" },
  { min: 5_000,  max: 20_000,  label: "5k–20k" },
  { min: 20_000, max: 50_000,  label: "20k–50k" },
  { min: 50_000, max: 100_000, label: "50k–100k" },
  { min: 100_000, max: null,   label: "> 100k" },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toString();
}

export default function WalletGeoLanding({ epic, summaries, stories, theme }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");

  const logoPalette = useMemo(() => walletGeoLogoPalette(theme), [theme]);
  const mapPalette = useMemo(() => walletGeoMapPalette(theme), [theme]);
  const stops = useMemo(() => walletGeoChoroplethStops(theme), [theme]);

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
      if (!m) {
        setTimeout(tryBind, 50);
        return;
      }
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

  const codesWithData = useMemo(() => summaries.map((s) => s.code), [summaries]);

  // Mapbox `step` expression: addressCount → bucket color. We push the value
  // onto the feature via a `match` over the country code, then bucket via
  // `step` with the same thresholds as the legend.
  const fillColorExpr = useMemo(() => {
    const matchPairs: (string | number)[] = [];
    for (const s of summaries) {
      matchPairs.push(s.code, s.addressCount);
    }
    return [
      "step",
      ["coalesce", ["match", ["get", "iso_3166_1"], ...matchPairs, 0], 0],
      stops[0],
      BUCKETS[1].min, stops[1],
      BUCKETS[2].min, stops[2],
      BUCKETS[3].min, stops[3],
      BUCKETS[4].min, stops[4],
    ] as unknown as mapboxgl.ExpressionSpecification;
  }, [summaries, stops]);

  // Pin sizing: sqrt of address count, normalized to a soft 5–18 px range.
  const maxCount = useMemo(
    () => Math.max(1, ...summaries.map((s) => s.addressCount)),
    [summaries]
  );

  const pinsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: summaries.map((s) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] },
        properties: {
          code: s.code,
          name: s.name,
          addressCount: s.addressCount,
          coreRadius: 4 + Math.sqrt(s.addressCount / maxCount) * 12,
          label: `${s.name} · ${formatCount(s.addressCount)}`,
        },
      })),
    }),
    [summaries, maxCount]
  );

  const selectCountry = (code: string) => {
    const s = summaries.find((x) => x.code === code);
    if (!s) return;
    setSelectedCode(code);
    mapRef.current?.getMap().easeTo({
      center: [s.lng, s.lat],
      zoom: 3.2,
      duration: 900,
      essential: true,
    });
  };

  const totalAddresses = useMemo(
    () => summaries.reduce((a, b) => a + b.addressCount, 0),
    [summaries]
  );

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={
        {
          background: theme.ink,
          color: theme.bone,
          "--vmy-surface": theme.surface,
          "--vmy-bone": theme.bone,
          "--vmy-ember": theme.accent,
          "--vmy-ink": theme.ink,
        } as CSSProperties
      }
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
        interactiveLayerIds={["wg-country-fill", "wg-pin-core"]}
        onMouseMove={(e) => {
          const feat = e.features?.[0];
          const code = (feat?.properties?.code ??
            feat?.properties?.iso_3166_1) as string | undefined;
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
          const code = (feat.properties?.code ??
            feat.properties?.iso_3166_1) as string | undefined;
          if (!code) return;
          if (codesWithData.includes(code)) selectCountry(code);
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Source
          id="wg-country-boundaries"
          type="vector"
          url="mapbox://mapbox.country-boundaries-v1"
        >
          <Layer
            id="wg-country-fill"
            type="fill"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", codesWithData]]}
            paint={{
              "fill-color": fillColorExpr,
              "fill-opacity": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedCode ?? ""],
                0.95,
                ["==", ["get", "iso_3166_1"], hoveredCode ?? ""],
                0.78,
                0.62,
              ],
            }}
          />
          <Layer
            id="wg-country-outline"
            type="line"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", codesWithData]]}
            paint={{
              "line-color": theme.accentHi,
              "line-width": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedCode ?? ""],
                1.6,
                0.4,
              ],
              "line-opacity": 0.35,
            }}
          />
        </Source>

        <Source id="wg-pins" type="geojson" data={pinsGeoJson}>
          <Layer
            id="wg-pin-core"
            type="circle"
            paint={{
              "circle-radius": ["get", "coreRadius"],
              "circle-color": [
                "case",
                ["==", ["get", "code"], selectedCode ?? ""],
                theme.accentHi,
                ["==", ["get", "code"], hoveredCode ?? ""],
                theme.accentMid,
                theme.accent,
              ],
              "circle-opacity": 0.9,
              "circle-stroke-color": theme.accentEdge,
              "circle-stroke-width": 1,
              "circle-stroke-opacity": 0.7,
            }}
          />
          <Layer
            id="wg-country-labels"
            type="symbol"
            filter={[">", ["get", "addressCount"], 30_000]}
            layout={{
              "text-field": ["get", "label"],
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
              "text-size": 11,
              "text-offset": [0, -1.4],
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

      {/* Choropleth legend */}
      <div
        className={`absolute left-3 md:left-4 bottom-[96px] md:bottom-[88px] z-10 pointer-events-none ${
          selectedCode ? "hidden md:block" : ""
        }`}
      >
        <div
          className="rounded-full px-3 py-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap max-w-[calc(100vw-1.5rem)]"
          style={{
            background: alpha(theme.surface, 85),
            border: `1px solid ${alpha(theme.bone, 12)}`,
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <span
            className="text-[9px] font-mono uppercase tracking-wider mr-1"
            style={{ color: theme.muted }}
          >
            Addresses
          </span>
          {BUCKETS.map((b, i) => (
            <span key={b.label} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block rounded-sm"
                style={{ width: 10, height: 10, background: stops[i] }}
              />
              <span
                className="text-[10px] tracking-tight"
                style={{ color: alpha(theme.bone, 85) }}
              >
                {b.label}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* Header */}
      <div
        className="absolute top-0 left-0 right-0 z-10 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-4 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${alpha(theme.ink, 95)} 0%, ${alpha(
            theme.ink,
            70
          )} 60%, transparent 100%)`,
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
              Off-chain signal
            </div>
          </div>
          <div className="min-w-0">
            <h1
              className="text-base md:text-lg leading-tight tracking-tight"
              style={{
                fontFamily: "var(--font-fraunces), serif",
                color: theme.bone,
                fontWeight: 500,
              }}
            >
              {epic.name}
            </h1>
            {epic.description && (
              <p
                className="mt-0.5 text-[11px] md:text-xs max-w-xl"
                style={{ color: theme.muted }}
              >
                {epic.description}
              </p>
            )}
            <p
              className="text-[11px] md:text-xs mt-0.5 font-mono uppercase tracking-[0.18em]"
              style={{ color: theme.muted }}
            >
              <span style={{ color: theme.accentHi }}>{formatCount(totalAddresses)}</span> addresses
              <span className="mx-1.5 opacity-50">·</span>
              <span style={{ color: theme.accentHi }}>{summaries.length}</span> countries
            </p>
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
          Off-chain signal
        </div>
      </div>

      {selectedCode && (
        <CountryDetail
          key={selectedCode}
          code={selectedCode}
          onClose={() => setSelectedCode(null)}
          theme={theme}
        />
      )}

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
                className="wg-story-chip shrink-0 px-3 py-2 rounded text-sm"
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
        .wg-story-chip:hover {
          border-color: ${alpha(theme.accentHi, 60)};
          color: ${theme.accentHi};
        }
      `}</style>
    </div>
  );
}
