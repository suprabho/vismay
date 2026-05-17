"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import { Map, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import VizmayaLogo from "@/components/VizmayaLogo";
import type { DominantEnergySource, Epic, EpicStory, IeaCountry, IeaNewsItem } from "@/lib/epics";
import { MIX_SOURCES } from "@/lib/epics";
import { ENERGY_SOURCE_COLORS } from "@/components/energy-profile/charts/colors";
import { COUNTRY_CENTROIDS } from "@/lib/energy-profile/countryCentroids";
import { applyMapPalette } from "@vismay/viz-engine";
import { energyProfileLogoPalette, energyProfileMapPalette, type EnergyProfileTheme } from "./theme";
import CountryDetail from "./CountryDetail";

interface Props {
  epic: Epic;
  countries: IeaCountry[];
  news: IeaNewsItem[];
  stories: EpicStory[];
  theme: EnergyProfileTheme;
  dominantSources: Record<string, DominantEnergySource>;
}

const INITIAL_VIEW_STATE = {
  longitude: 10,
  latitude: 20,
  zoom: 1.3,
};

interface CountryPin extends IeaCountry {
  articleCount: number;
}

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;

export default function EnergyProfileLanding({ epic, countries, news, stories, theme, dominantSources }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");

  const logoPalette = useMemo(() => energyProfileLogoPalette(theme), [theme]);
  const mapPalette = useMemo(() => energyProfileMapPalette(theme), [theme]);

  // Restyle the stock dark-v11 base layers to match the epic palette. Polls
  // for the Mapbox instance (the ref may not be set on the first effect tick)
  // then applies on initial style load + on every subsequent style.load. Also
  // re-applies whenever the palette changes via theme overrides.
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

  const articleCountByCode = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of news) {
      for (const code of item.countryCodes) {
        counts[code] = (counts[code] ?? 0) + 1;
      }
    }
    return counts;
  }, [news]);

  // Pin set is the union of:
  //   - the 12 featured countries from `iea_countries` (always shown, even
  //     with 0 articles, so users can click for the editorial profile)
  //   - any other country tagged in the last-7-day news window, looked up
  //     in COUNTRY_CENTROIDS for lat/lng (no summary)
  // Without the second group, news for countries outside the featured 12
  // would be silently dropped from the map.
  const pins: CountryPin[] = useMemo(() => {
    const featuredCodes = new Set(countries.map((c) => c.code));
    const featured: CountryPin[] = countries.map((c) => ({
      ...c,
      articleCount: articleCountByCode[c.code] ?? 0,
    }));
    const extras: CountryPin[] = [];
    for (const [code, count] of Object.entries(articleCountByCode)) {
      if (featuredCodes.has(code)) continue;
      const centroid = COUNTRY_CENTROIDS[code];
      if (!centroid) continue;
      extras.push({
        code,
        name: centroid.name,
        lat: centroid.lat,
        lng: centroid.lng,
        summary: null,
        articleCount: count,
      });
    }
    return [...featured, ...extras];
  }, [countries, articleCountByCode]);

  const featuredCodes = useMemo(() => countries.map((c) => c.code), [countries]);
  const newsCodes = useMemo(
    () => Object.keys(articleCountByCode).filter((c) => articleCountByCode[c] > 0),
    [articleCountByCode]
  );

  // Only paint countries with actual primary-energy data. Featured editorial
  // countries with no OWID coverage still render their pins; leaving their
  // polygon transparent keeps the choropleth story honest (no false "fallback"
  // color masquerading as a real fuel mix).
  const codesWithData = useMemo(() => Object.keys(dominantSources), [dominantSources]);

  const fillColorExpr = useMemo(() => {
    const entries: string[] = [];
    for (const [code, d] of Object.entries(dominantSources)) {
      const hex = ENERGY_SOURCE_COLORS[d.sourceLabel];
      if (!hex) continue;
      entries.push(code, hex);
    }
    // Fallback never hits (filter excludes everything else) but Mapbox `match`
    // requires it. Use a transparent black just in case.
    return ["match", ["get", "iso_3166_1"], ...entries, "rgba(0,0,0,0)"] as any;
  }, [dominantSources]);

  const maxCount = useMemo(
    () => Math.max(1, ...pins.map((p) => p.articleCount)),
    [pins]
  );

  const pinsGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: pins.map((p) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
        properties: {
          code: p.code,
          name: p.name,
          articleCount: p.articleCount,
          coreRadius: 5 + Math.sqrt(p.articleCount / maxCount) * 9,
          basePulseRadius: 10 + Math.sqrt(p.articleCount / maxCount) * 14,
          label:
            p.articleCount > 0 ? `${p.name} · ${p.articleCount}` : p.name,
        },
      })),
    }),
    [pins, maxCount]
  );

  const selectCountry = (pin: CountryPin) => {
    setSelectedCode(pin.code);
    mapRef.current?.getMap().easeTo({
      center: [pin.lng, pin.lat],
      zoom: 3.2,
      duration: 900,
      essential: true,
    });
  };

  // Drive the pulse ring's radius + opacity each frame via setPaintProperty.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const map = mapRef.current?.getMap();
      if (map && map.getLayer("ep-pulse-ring")) {
        const phase = ((t - start) % 1800) / 1800;
        map.setPaintProperty("ep-pulse-ring", "circle-radius", [
          "*",
          ["get", "basePulseRadius"],
          1 + phase * 1.6,
        ]);
        map.setPaintProperty(
          "ep-pulse-ring",
          "circle-opacity",
          0.55 * (1 - phase)
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={{
        background: theme.ink,
        color: theme.bone,
        // CSS vars consumed by the shared DetailSheet + CountryDetail via
        // color-mix(). Sourced from the Energy Profile theme so admin recolours
        // flow through to the country profile sheet without a separate provider.
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
        interactiveLayerIds={[
          "ep-country-fill",
          "ep-pulse-core",
          "ep-static-dot",
        ]}
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
          const pin = pins.find((p) => p.code === code);
          if (pin) selectCountry(pin);
        }}
        style={{ position: "absolute", inset: 0 }}
      >
        <Source
          id="ep-country-boundaries"
          type="vector"
          url="mapbox://mapbox.country-boundaries-v1"
        >
          <Layer
            id="ep-country-fill"
            type="fill"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", codesWithData]]}
            paint={{
              "fill-color": fillColorExpr,
              "fill-opacity": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedCode ?? ""],
                0.90,
                ["==", ["get", "iso_3166_1"], hoveredCode ?? ""],
                0.78,
                ["in", ["get", "iso_3166_1"], ["literal", newsCodes]],
                0.72,
                0.62,
              ],
            }}
          />
          <Layer
            id="ep-country-outline"
            type="line"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", codesWithData]]}
            paint={{
              "line-color": theme.accentHi,
              "line-width": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedCode ?? ""],
                1.6,
                ["in", ["get", "iso_3166_1"], ["literal", featuredCodes]],
                0.6,
                0.25,
              ],
              "line-opacity": [
                "case",
                ["in", ["get", "iso_3166_1"], ["literal", featuredCodes]],
                0.65,
                0.35,
              ],
            }}
          />
        </Source>

        <Source id="ep-pins" type="geojson" data={pinsGeoJson}>
          <Layer
            id="ep-pulse-ring"
            type="circle"
            filter={[">", ["get", "articleCount"], 0]}
            paint={{
              "circle-radius": ["get", "basePulseRadius"],
              "circle-color": theme.accent,
              "circle-opacity": 0.45,
              "circle-stroke-width": 0,
              "circle-pitch-alignment": "map",
            }}
          />
          <Layer
            id="ep-pulse-core"
            type="circle"
            filter={[">", ["get", "articleCount"], 0]}
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
              "circle-opacity": 0.95,
              "circle-stroke-color": theme.accentEdge,
              "circle-stroke-width": 1,
              "circle-stroke-opacity": 0.9,
            }}
          />
          <Layer
            id="ep-static-dot"
            type="circle"
            filter={["==", ["get", "articleCount"], 0]}
            paint={{
              "circle-radius": 4,
              "circle-color": [
                "case",
                ["==", ["get", "code"], hoveredCode ?? ""],
                theme.accentMid,
                theme.accentLo,
              ],
              "circle-opacity": 0.7,
              "circle-stroke-color": theme.accentEdge,
              "circle-stroke-width": 1,
              "circle-stroke-opacity": 0.55,
            }}
          />
          <Layer
            id="ep-country-labels"
            type="symbol"
            filter={[">", ["get", "articleCount"], 0]}
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

      {/* ── Energy-source legend ────────────────────────────────────────── */}
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
            Dominant fuel
          </span>
          {MIX_SOURCES.map((src) => (
            <span key={src.key} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block rounded-full"
                style={{
                  width: 8,
                  height: 8,
                  background: ENERGY_SOURCE_COLORS[src.label],
                }}
              />
              <span
                className="text-[10px] tracking-tight"
                style={{ color: alpha(theme.bone, 85) }}
              >
                {src.label}
              </span>
            </span>
          ))}
        </div>
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
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
              Last 7 days
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
            <p
              className="text-[11px] md:text-xs mt-0.5 font-mono uppercase tracking-[0.18em]"
              style={{ color: theme.muted }}
            >
              <span style={{ color: theme.accentHi }}>{news.length}</span> articles
              <span className="mx-1.5 opacity-50">·</span>
              <span style={{ color: theme.accentHi }}>{pins.length}</span> countries
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
          Last 7 days
        </div>
      </div>

      {/* Country detail sheet — bottom sheet on mobile, left-side floating panel at md+. */}
      {selectedCode && (
        <CountryDetail code={selectedCode} onClose={() => setSelectedCode(null)} />
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
                className="ep-story-chip shrink-0 px-3 py-2 rounded text-sm"
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
        .ep-story-chip:hover {
          border-color: ${alpha(theme.accentHi, 60)};
          color: ${theme.accentHi};
        }
      `}</style>
    </div>
  );
}
