"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import { Map, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import VizmayaLogo from "@/components/VizmayaLogo";
import type { Epic, EpicStory } from "@vismay/content-source/epics";
import type { TradeLandscape } from "@vismay/content-source/trade";
import RadialTradeNetwork from "@/components/global-trade/charts/RadialTradeNetwork";
import { formatUsd } from "@/components/global-trade/charts/colors";
import { COUNTRY_CENTROIDS } from "@/lib/energy-profile/countryCentroids";
import { applyMapPalette } from "@vismay/viz-engine";
import { globalTradeLogoPalette, globalTradeMapPalette, type GlobalTradeTheme } from "./theme";
import ReporterDetail from "./ReporterDetail";

interface Props {
  epic: Pick<Epic, "slug" | "name" | "description">;
  landscape: TradeLandscape | null;
  stories: EpicStory[];
  theme: GlobalTradeTheme;
  mapStyle: string;
}

const INITIAL_VIEW_STATE = {
  longitude: 60,
  latitude: 22,
  zoom: 1.4,
};

interface ReporterPin {
  code: string;
  name: string;
  totalUsd: number;
  lat: number;
  lng: number;
}

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

export default function GlobalTradeLanding({ epic, landscape, stories, theme, mapStyle }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");
  const [networkOpen, setNetworkOpen] = useState(false);

  // Same base-map restyling loop as the energy-profile globe: poll for the
  // Mapbox instance, then re-apply the palette on every style.load.
  const logoPalette = useMemo(() => globalTradeLogoPalette(theme), [theme]);
  const mapPalette = useMemo(() => globalTradeMapPalette(theme), [theme]);
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

  // The trade web is the desktop centerpiece; open it once on mount at lg+
  // (not in the initializer — SSR renders closed, and the initializer would
  // hydrate-mismatch).
  useEffect(() => {
    if (window.matchMedia("(min-width: 1024px)").matches) setNetworkOpen(true);
  }, []);

  const pins: ReporterPin[] = useMemo(() => {
    if (!landscape) return [];
    return landscape.reporters
      .map((r) => {
        const centroid = COUNTRY_CENTROIDS[r.code];
        if (!centroid) return null;
        return { code: r.code, name: r.name, totalUsd: r.totalUsd, lat: centroid.lat, lng: centroid.lng };
      })
      .filter((p): p is ReporterPin => p !== null);
  }, [landscape]);

  const maxTotal = useMemo(() => Math.max(1, ...pins.map((p) => p.totalUsd)), [pins]);
  const trackedTotal = useMemo(
    () => pins.reduce((sum, p) => sum + p.totalUsd, 0),
    [pins],
  );
  const reporterCodes = useMemo(() => pins.map((p) => p.code), [pins]);

  const pinsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pins.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: {
          code: p.code,
          name: p.name,
          radius: 4 + Math.sqrt(p.totalUsd / maxTotal) * 14,
          label: `${p.name} · ${formatUsd(p.totalUsd)}`,
        },
      })),
    }),
    [pins, maxTotal]
  );

  const selectReporter = (code: string) => {
    const pin = pins.find((p) => p.code === code);
    if (!pin) return;
    setSelectedCode(code);
    mapRef.current?.getMap().easeTo({
      center: [pin.lng, pin.lat],
      zoom: 2.6,
      duration: 900,
      essential: true,
    });
  };

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{
        background: theme.ink,
        color: theme.bone,
        // CSS vars consumed by the shared DetailSheet + ReporterDetail.
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
        projection="globe"
        attributionControl={false}
        doubleClickZoom={false}
        cursor={cursor}
        interactiveLayerIds={["gt-country-fill", "gt-pin-core"]}
        onMouseMove={(e) => {
          const feat = e.features?.[0];
          const code = (feat?.properties?.code ?? feat?.properties?.iso_3166_1) as string | undefined;
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
          const code = (feat.properties?.code ?? feat.properties?.iso_3166_1) as string | undefined;
          if (code) selectReporter(code);
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Source id="gt-country-boundaries" type="vector" url="mapbox://mapbox.country-boundaries-v1">
          <Layer
            id="gt-country-fill"
            type="fill"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", reporterCodes]]}
            paint={{
              "fill-color": theme.accent,
              "fill-opacity": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedCode ?? ""],
                0.55,
                ["==", ["get", "iso_3166_1"], hoveredCode ?? ""],
                0.4,
                0.18,
              ],
            }}
          />
          <Layer
            id="gt-country-outline"
            type="line"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", reporterCodes]]}
            paint={{
              "line-color": theme.accentHi,
              "line-width": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedCode ?? ""],
                1.6,
                0.5,
              ],
              "line-opacity": 0.55,
            }}
          />
        </Source>

        <Source id="gt-pins" type="geojson" data={pinsGeoJson}>
          <Layer
            id="gt-pin-halo"
            type="circle"
            paint={{
              "circle-radius": ["*", ["get", "radius"], 1.8],
              "circle-color": theme.accent,
              "circle-opacity": 0.12,
              "circle-pitch-alignment": "map",
            }}
          />
          <Layer
            id="gt-pin-core"
            type="circle"
            paint={{
              "circle-radius": ["get", "radius"],
              "circle-color": [
                "case",
                ["==", ["get", "code"], selectedCode ?? ""],
                theme.accentHi,
                ["==", ["get", "code"], hoveredCode ?? ""],
                theme.accentMid,
                theme.accent,
              ],
              "circle-opacity": 0.92,
              "circle-stroke-color": theme.accentEdge,
              "circle-stroke-width": 1,
              "circle-stroke-opacity": 0.85,
            }}
          />
          <Layer
            id="gt-pin-labels"
            type="symbol"
            layout={{
              "text-field": ["get", "label"],
              "text-font": ["DIN Offc Pro Medium", "Arial Unicode MS Regular"],
              "text-size": 10.5,
              "text-offset": [0, -1.5],
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

      {/* ── Header ─────────────────────────────────────────────────────── */}
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
            <VizmayaLogo className="w-[150px] h-[36px] md:w-[180px] md:h-[44px]" palette={logoPalette} />
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
            {landscape && (
              <p className="text-[11px] md:text-xs mt-0.5 font-mono uppercase tracking-[0.18em]" style={{ color: theme.muted }}>
                <span style={{ color: theme.accentHi }}>{formatUsd(trackedTotal)}</span> goods exports
                <span className="mx-1.5 opacity-50">·</span>
                <span style={{ color: theme.accentHi }}>{pins.length}</span> exporters
                <span className="mx-1.5 opacity-50">·</span>
                {landscape.year}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => setNetworkOpen((v) => !v)}
          className="pointer-events-auto shrink-0 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wider transition-colors"
          style={{
            background: networkOpen ? alpha(theme.accent, 20) : alpha(theme.surface, 85),
            border: `1px solid ${networkOpen ? alpha(theme.accentHi, 50) : alpha(theme.bone, 12)}`,
            color: theme.accentHi,
          }}
        >
          Trade web {networkOpen ? "−" : "+"}
        </button>
      </div>

      {/* ── No-data state ───────────────────────────────────────────────── */}
      {!landscape && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div
            className="rounded-lg px-5 py-4 text-center"
            style={{
              background: alpha(theme.surface, 90),
              border: `1px solid ${alpha(theme.bone, 12)}`,
            }}
          >
            <p className="text-sm" style={{ color: theme.bone }}>No trade data imported yet.</p>
            <p className="text-[11px] font-mono mt-1" style={{ color: theme.muted }}>
              Run <code>pnpm trade:import-comtrade -- --full</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Radial trade network panel ──────────────────────────────────── */}
      {landscape && networkOpen && (
        <div
          className="absolute z-20 flex flex-col rounded-2xl lg:rounded-xl overflow-hidden backdrop-blur inset-3 top-[88px] bottom-[96px] lg:inset-auto lg:right-4 lg:top-20 lg:bottom-24 lg:w-[440px] xl:w-[500px]"
          style={{
            background: alpha(theme.surface, 92),
            border: `1px solid ${alpha(theme.bone, 10)}`,
            boxShadow: "0 24px 48px -12px rgba(0,0,0,0.7)",
          }}
        >
          <div
            className="px-4 pt-3 pb-2 flex items-start justify-between gap-2 shrink-0"
            style={{ borderBottom: `1px solid ${alpha(theme.bone, 8)}` }}
          >
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.22em]" style={{ color: theme.accent }}>
                Trade web · {landscape.year}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: theme.muted }}>
                Each line links an exporter to one of its top HS chapters — hover to trace, click a country to open its profile.
              </p>
              <p className="text-[10px] font-mono mt-1 flex items-center gap-3" style={{ color: theme.muted }}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: theme.accent }} />
                  Exporters
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block rounded-full" style={{ width: 7, height: 7, background: theme.chapter }} />
                  HS chapters
                </span>
              </p>
            </div>
            <button
              onClick={() => setNetworkOpen(false)}
              aria-label="Close trade web"
              className="text-lg leading-none shrink-0 hover:text-white"
              style={{ color: alpha(theme.bone, 50) }}
            >
              ×
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <RadialTradeNetwork landscape={landscape} onSelectReporter={selectReporter} />
          </div>
        </div>
      )}

      {/* Reporter detail sheet — bottom sheet on mobile, left panel at md+. */}
      {selectedCode && (
        <ReporterDetail code={selectedCode} onClose={() => setSelectedCode(null)} />
      )}

      {/* ── Stories rail ────────────────────────────────────────────────── */}
      <footer
        className="absolute left-0 right-0 bottom-0 z-10 px-6 py-4"
        style={{ background: `linear-gradient(to top, ${alpha(theme.ink, 95)}, transparent)` }}
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
                className="gt-story-chip shrink-0 px-3 py-2 rounded text-sm"
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
        .gt-story-chip:hover {
          border-color: ${alpha(theme.accentHi, 60)};
          color: ${theme.accentHi};
        }
      `}</style>
    </div>
  );
}
