"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import "mapbox-gl/dist/mapbox-gl.css";
import { Map } from "react-map-gl/mapbox";
import { DeckGL } from "@deck.gl/react";
import { FlyToInterpolator } from "deck.gl";
import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Epic, EpicStory, IeaCountry, IeaNewsItem } from "@/lib/epics";

interface Props {
  epic: Epic;
  countries: IeaCountry[];
  news: IeaNewsItem[];
  stories: EpicStory[];
}

const INITIAL_VIEW_STATE = {
  longitude: 10,
  latitude: 25,
  zoom: 1.6,
  pitch: 0,
  bearing: 0,
};

interface CountryPin extends IeaCountry {
  articleCount: number;
}

export default function IeaLanding({ epic, countries, news, stories }: Props) {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  // Articles per ISO code in the last-7-day window.
  const articleCountByCode = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of news) {
      for (const code of item.countryCodes) {
        counts[code] = (counts[code] ?? 0) + 1;
      }
    }
    return counts;
  }, [news]);

  const pins: CountryPin[] = useMemo(
    () =>
      countries.map((c) => ({ ...c, articleCount: articleCountByCode[c.code] ?? 0 })),
    [countries, articleCountByCode]
  );

  const maxCount = useMemo(
    () => Math.max(1, ...pins.map((p) => p.articleCount)),
    [pins]
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
    setViewState({
      ...INITIAL_VIEW_STATE,
      longitude: pin.lng,
      latitude: pin.lat,
      zoom: 3.2,
      // @ts-expect-error deck.gl transition props
      transitionDuration: 900,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    });
  };

  // Pins sized by article count; countries with 0 articles render as faint dots
  // so the user still sees them and can click for the profile.
  const pinLayer = new ScatterplotLayer<CountryPin>({
    id: "iea-country-pins",
    data: pins,
    getPosition: (d) => [d.lng, d.lat],
    getRadius: (d) =>
      80000 + Math.sqrt(d.articleCount / maxCount) * 260000,
    radiusUnits: "meters",
    radiusMinPixels: 6,
    radiusMaxPixels: 48,
    getFillColor: (d) => {
      const isSelected = d.code === selectedCode;
      const isHovered = d.code === hoveredCode;
      if (isSelected) return [255, 200, 80, 240];
      if (isHovered) return [255, 170, 60, 220];
      if (d.articleCount === 0) return [120, 120, 130, 140];
      return [255, 140, 40, 210];
    },
    getLineColor: [255, 220, 160, 220],
    lineWidthMinPixels: 1,
    stroked: true,
    pickable: true,
    onHover: ({ object }) => setHoveredCode(object?.code ?? null),
    onClick: ({ object }) => object && selectCountry(object),
    updateTriggers: {
      getFillColor: [selectedCode, hoveredCode],
    },
  });

  const labelLayer = new TextLayer<CountryPin>({
    id: "iea-country-labels",
    data: pins,
    getPosition: (d) => [d.lng, d.lat],
    getText: (d) =>
      d.articleCount > 0 ? `${d.name} · ${d.articleCount}` : d.name,
    getSize: 11,
    getColor: [255, 220, 180, 230],
    getBackgroundColor: [0, 0, 0, 170],
    background: true,
    backgroundPadding: [4, 2, 4, 2],
    fontFamily: "monospace",
    getTextAnchor: "middle",
    getAlignmentBaseline: "bottom",
    getPixelOffset: [0, -12],
  });

  return (
    <div className="relative w-full h-screen bg-black text-white overflow-hidden">
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }: { viewState: unknown }) =>
          setViewState(vs as typeof viewState)
        }
        controller={{ doubleClickZoom: false }}
        layers={[pinLayer, labelLayer]}
        style={{ position: "absolute", top: "0", left: "0", right: "0", bottom: "0" }}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
        onClick={({ object }) => {
          if (!object) setSelectedCode(null);
        }}
      >
        <Map
          reuseMaps
          mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          projection={{ name: "mercator" }}
          attributionControl={false}
        />
      </DeckGL>

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-10 px-6 py-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-zinc-400 hover:text-white pointer-events-auto"
          >
            vizmaya
          </Link>
          <span className="text-xs text-zinc-600">/</span>
          <h1 className="text-sm font-semibold tracking-wide text-white">
            {epic.name}
          </h1>
        </div>
        {epic.description && (
          <p className="mt-1 text-xs text-zinc-400 max-w-xl">{epic.description}</p>
        )}
        <p className="mt-2 text-[11px] uppercase tracking-widest text-zinc-500">
          {news.length} articles · last 7 days · {countries.length} countries
        </p>
      </header>

      {/* Side panel */}
      {selectedCountry && (
        <aside className="absolute top-20 right-4 bottom-32 w-[360px] z-20 bg-zinc-950/95 border border-zinc-800 rounded-lg shadow-2xl flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">
                Country profile
              </div>
              <h2 className="text-lg font-semibold text-white mt-0.5">
                {selectedCountry.name}
              </h2>
            </div>
            <button
              onClick={() => setSelectedCode(null)}
              className="text-zinc-500 hover:text-white text-sm leading-none"
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
          <div className="px-5 py-4 overflow-y-auto flex-1">
            {selectedCountry.summary && (
              <p className="text-sm text-zinc-300 leading-relaxed">
                {selectedCountry.summary}
              </p>
            )}
            <div className="mt-5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                Last 7 days
              </div>
              {selectedNews.length === 0 ? (
                <p className="text-xs text-zinc-500">No recent articles.</p>
              ) : (
                <ul className="space-y-3">
                  {selectedNews.map((n) => (
                    <li key={n.id}>
                      <a
                        href={n.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block group"
                      >
                        <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">
                          {new Date(n.publishedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div className="text-sm text-zinc-200 group-hover:text-amber-200 leading-snug">
                          {n.title}
                        </div>
                        {n.summary && (
                          <div className="text-xs text-zinc-500 mt-1 leading-snug">
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
      <footer className="absolute left-0 right-0 bottom-0 z-10 px-6 py-4 bg-gradient-to-t from-black/95 to-transparent">
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
          vizmaya stories
        </div>
        {stories.length === 0 ? (
          <p className="text-xs text-zinc-600">
            No stories assigned to this epic yet.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {stories.map((s) => (
              <Link
                key={s.slug}
                href={`/story/${s.slug}`}
                className="shrink-0 px-3 py-2 border border-zinc-800 hover:border-amber-500/60 rounded text-sm text-zinc-200 hover:text-amber-200 bg-zinc-950/60"
              >
                {s.title}
              </Link>
            ))}
          </div>
        )}
      </footer>
    </div>
  );
}
