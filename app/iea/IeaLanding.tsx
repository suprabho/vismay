"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import { Map, Source, Layer, type MapRef } from "react-map-gl/mapbox";
import VizmayaLogo from "@/components/VizmayaLogo";
import type { Epic, EpicStory, IeaCountry, IeaNewsItem } from "@/lib/epics";
import { COUNTRY_CENTROIDS } from "@/lib/iea/countryCentroids";
import { ieaLogoPalette, type IeaTheme } from "./theme";

interface Props {
  epic: Epic;
  countries: IeaCountry[];
  news: IeaNewsItem[];
  stories: EpicStory[];
  theme: IeaTheme;
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

export default function IeaLanding({ epic, countries, news, stories, theme }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [cursor, setCursor] = useState<"grab" | "pointer">("grab");

  const logoPalette = useMemo(() => ieaLogoPalette(theme), [theme]);

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

  const ieaCodes = useMemo(() => countries.map((c) => c.code), [countries]);
  const newsCodes = useMemo(
    () => Object.keys(articleCountByCode).filter((c) => articleCountByCode[c] > 0),
    [articleCountByCode]
  );

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

  const selectedCountry = useMemo(
    () => (selectedCode ? pins.find((p) => p.code === selectedCode) ?? null : null),
    [selectedCode, pins]
  );

  const selectedNews = useMemo(
    () => (selectedCode ? news.filter((n) => n.countryCodes.includes(selectedCode)) : []),
    [news, selectedCode]
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
      if (map && map.getLayer("iea-pulse-ring")) {
        const phase = ((t - start) % 1800) / 1800;
        map.setPaintProperty("iea-pulse-ring", "circle-radius", [
          "*",
          ["get", "basePulseRadius"],
          1 + phase * 1.6,
        ]);
        map.setPaintProperty(
          "iea-pulse-ring",
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
      style={{ background: theme.ink, color: theme.bone }}
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
          "iea-country-fill",
          "iea-pulse-core",
          "iea-static-dot",
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
          id="iea-country-boundaries"
          type="vector"
          url="mapbox://mapbox.country-boundaries-v1"
        >
          <Layer
            id="iea-country-fill"
            type="fill"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", ieaCodes]]}
            paint={{
              "fill-color": [
                "case",
                ["in", ["get", "iso_3166_1"], ["literal", newsCodes]],
                theme.accent,
                theme.accentHi,
              ],
              "fill-opacity": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedCode ?? ""],
                0.35,
                ["==", ["get", "iso_3166_1"], hoveredCode ?? ""],
                0.28,
                ["in", ["get", "iso_3166_1"], ["literal", newsCodes]],
                0.2,
                0.1,
              ],
            }}
          />
          <Layer
            id="iea-country-outline"
            type="line"
            source-layer="country_boundaries"
            filter={["in", ["get", "iso_3166_1"], ["literal", ieaCodes]]}
            paint={{
              "line-color": theme.accentHi,
              "line-width": [
                "case",
                ["==", ["get", "iso_3166_1"], selectedCode ?? ""],
                1.6,
                0.6,
              ],
              "line-opacity": 0.65,
            }}
          />
        </Source>

        <Source id="iea-pins" type="geojson" data={pinsGeoJson}>
          <Layer
            id="iea-pulse-ring"
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
            id="iea-pulse-core"
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
            id="iea-static-dot"
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
            id="iea-country-labels"
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

      {/* Header */}
      <header
        className="absolute top-0 left-0 right-0 z-10 px-6 py-4 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${alpha(theme.ink, 80)}, transparent)`,
        }}
      >
        <div className="flex items-start gap-4">
          <Link href="/" className="pointer-events-auto shrink-0">
            <VizmayaLogo
              className="w-[160px] h-[40px]"
              palette={logoPalette}
            />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold tracking-wide" style={{ color: theme.bone }}>
              {epic.name}
            </h1>
            {epic.description && (
              <p className="mt-1 text-xs max-w-xl" style={{ color: theme.muted }}>
                {epic.description}
              </p>
            )}
            <p
              className="mt-2 text-[11px] uppercase tracking-widest"
              style={{ color: alpha(theme.muted, 80) }}
            >
              {news.length} articles · last 7 days · {pins.length} countries
            </p>
          </div>
        </div>
      </header>

      {/* Side panel */}
      {selectedCountry && (
        <aside
          className="absolute top-20 right-4 bottom-32 w-[360px] z-20 rounded-lg shadow-2xl flex flex-col overflow-hidden"
          style={{
            background: alpha(theme.surface, 95),
            border: `1px solid ${theme.line}`,
          }}
        >
          <div
            className="px-5 py-4 flex items-start justify-between gap-2"
            style={{ borderBottom: `1px solid ${theme.line}` }}
          >
            <div>
              <div
                className="text-[10px] uppercase tracking-widest"
                style={{ color: theme.muted }}
              >
                Country profile
              </div>
              <h2
                className="text-lg font-semibold mt-0.5"
                style={{ color: theme.bone }}
              >
                {selectedCountry.name}
              </h2>
            </div>
            <button
              onClick={() => setSelectedCode(null)}
              className="text-sm leading-none transition-colors"
              style={{ color: theme.muted }}
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1">
            {selectedCountry.summary && (
              <p
                className="text-sm leading-relaxed"
                style={{ color: alpha(theme.bone, 85) }}
              >
                {selectedCountry.summary}
              </p>
            )}
            <div className="mt-5">
              <div
                className="text-[10px] uppercase tracking-widest mb-2"
                style={{ color: theme.muted }}
              >
                Last 7 days
              </div>
              {selectedNews.length === 0 ? (
                <p className="text-xs" style={{ color: theme.muted }}>
                  No recent articles.
                </p>
              ) : (
                <ul className="space-y-3">
                  {selectedNews.map((n) => (
                    <li key={n.id}>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="iea-link block group"
                      >
                        <div
                          className="text-[10px] uppercase tracking-widest mb-0.5"
                          style={{ color: alpha(theme.muted, 70) }}
                        >
                          {new Date(n.publishedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div
                          className="text-sm leading-snug iea-link-title"
                          style={{ color: alpha(theme.bone, 90) }}
                        >
                          {n.title}
                        </div>
                        {n.summary && (
                          <div
                            className="text-xs mt-1 leading-snug"
                            style={{ color: theme.muted }}
                          >
                            {n.summary}
                          </div>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>
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
                className="iea-story-chip shrink-0 px-3 py-2 rounded text-sm"
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
        .iea-link:hover .iea-link-title {
          color: ${theme.accentHi};
        }
        .iea-story-chip:hover {
          border-color: ${alpha(theme.accentHi, 60)};
          color: ${theme.accentHi};
        }
      `}</style>
    </div>
  );
}
