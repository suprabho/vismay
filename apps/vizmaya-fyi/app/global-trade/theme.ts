// Palette for the Global Trade epic landing. Same key structure and override
// mechanics as the Energy Profile theme (app/energy-profile/theme.ts): the
// epic row's `theme` jsonb wins key-by-key over these defaults, so admin
// recolours flow through without code changes.

import type { MapPalette } from "@vismay/viz-engine";

export type GlobalTradeTheme = {
  ink: string;
  surface: string;
  elevated: string;
  bone: string;
  muted: string;
  line: string;
  accent: string;
  accentMid: string;
  accentHi: string;
  accentLo: string;
  accentEdge: string;
  /** Secondary accent for HS-chapter (product) nodes in the trade network. */
  chapter: string;
  mapLand: string;
  mapWater: string;
  mapBorder: string;
  mapLabelText: string;
  mapLabelHalo: string;
  mapBuilding: string;
};

export const GLOBAL_TRADE_THEME_DEFAULTS: GlobalTradeTheme = {
  ink: "#06080b",
  surface: "#0a0e13",
  elevated: "#141b24",
  bone: "#e9f1f2",
  muted: "#8b98a5",
  line: "#1e2833",
  accent: "#2dd4bf",
  accentMid: "#5eead4",
  accentHi: "#99f6e4",
  accentLo: "#4b5f6e",
  accentEdge: "#ccfbf1",
  chapter: "#e8b84b",
  mapLand: "#10161d",
  mapWater: "#06080b",
  mapBorder: "#1e2833",
  mapLabelText: "#e9f1f2",
  mapLabelHalo: "#06080b",
  mapBuilding: "#10161d",
};

export const GLOBAL_TRADE_THEME_LABELS: Record<keyof GlobalTradeTheme, { label: string; hint: string }> = {
  ink: { label: "Ink", hint: "Page background, text halo" },
  surface: { label: "Surface", hint: "Side panel background" },
  elevated: { label: "Elevated", hint: "Card / hover state" },
  bone: { label: "Bone", hint: "Primary text, logo" },
  muted: { label: "Muted", hint: "Secondary text" },
  line: { label: "Line", hint: "Dividers and borders" },
  accent: { label: "Accent", hint: "Reporter pins + network country nodes" },
  accentMid: { label: "Accent Mid", hint: "Hovered pin" },
  accentHi: { label: "Accent High", hint: "Selected pin + outlines" },
  accentLo: { label: "Accent Low", hint: "Small / inactive pin" },
  accentEdge: { label: "Accent Edge", hint: "Pin stroke + label text" },
  chapter: { label: "Chapter", hint: "HS-chapter nodes in the trade network" },
  mapLand: { label: "Map Land", hint: "Country / land fill on the base map" },
  mapWater: { label: "Map Water", hint: "Ocean + waterway fill" },
  mapBorder: { label: "Map Border", hint: "Country boundary lines" },
  mapLabelText: { label: "Map Label Text", hint: "Country / place label color" },
  mapLabelHalo: { label: "Map Label Halo", hint: "Outline behind label text" },
  mapBuilding: { label: "Map Building", hint: "3D / 2D building fill (subtle at low zoom)" },
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolveGlobalTradeTheme(override: unknown): GlobalTradeTheme {
  if (!override || typeof override !== "object") return GLOBAL_TRADE_THEME_DEFAULTS;
  const out: GlobalTradeTheme = { ...GLOBAL_TRADE_THEME_DEFAULTS };
  for (const key of Object.keys(GLOBAL_TRADE_THEME_DEFAULTS) as (keyof GlobalTradeTheme)[]) {
    const v = (override as Record<string, unknown>)[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v;
  }
  return out;
}

export const GLOBAL_TRADE_MAP_STYLE_DEFAULT = "mapbox://styles/mapbox/dark-v11";

export function resolveGlobalTradeMapStyle(override: unknown): string {
  if (!override || typeof override !== "object") return GLOBAL_TRADE_MAP_STYLE_DEFAULT;
  const v = (override as Record<string, unknown>).mapStyle;
  return typeof v === "string" && v.length > 0 ? v : GLOBAL_TRADE_MAP_STYLE_DEFAULT;
}

export function globalTradeMapPalette(theme: GlobalTradeTheme): MapPalette {
  return {
    land: theme.mapLand,
    water: theme.mapWater,
    border: theme.mapBorder,
    labelText: theme.mapLabelText,
    labelHalo: theme.mapLabelHalo,
    building: theme.mapBuilding,
    placeLabels: theme.mapLabelText,
  };
}

export function globalTradeLogoPalette(theme: GlobalTradeTheme) {
  return {
    text: theme.bone,
    teal: theme.accentHi,
    accent: theme.accent,
    accent2: theme.chapter,
    surface: theme.surface,
    muted: theme.muted,
    line: theme.bone,
  };
}
