// Palette for the FIFA WC 2026 epic landing. Greens + golds nod to the pitch +
// trophy. Ported from vizmaya-fyi; the epic's `theme` JSON (edited in the admin
// theme editor and stored on the shared `epics` row) overrides these defaults.

import type { MapPalette } from "@vismay/viz-engine";

export type FifaWc26Theme = {
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
  ramp1: string;
  ramp2: string;
  ramp3: string;
  ramp4: string;
  ramp5: string;
  mapLand: string;
  mapWater: string;
  mapBorder: string;
  mapLabelText: string;
  mapLabelHalo: string;
  mapBuilding: string;
};

export const FIFA_WC26_THEME_DEFAULTS: FifaWc26Theme = {
  ink: "#06120a",
  surface: "#0a1810",
  elevated: "#13261b",
  bone: "#f4ecd2",
  muted: "#9bb39f",
  line: "#1f3a2a",
  accent: "#2f8f4a",
  accentMid: "#4cb46a",
  accentHi: "#f0c64b",
  accentLo: "#5a7a64",
  accentEdge: "#fff1b0",
  ramp1: "#161e28",
  ramp2: "#4a7c8a",
  ramp3: "#5f8a7a",
  ramp4: "#d4a84a",
  ramp5: "#f0c64b",
  mapLand: "#13261b",
  mapWater: "#0a1810",
  mapBorder: "#1f3a2a",
  mapLabelText: "#f4ecd2",
  mapLabelHalo: "#06120a",
  mapBuilding: "#13261b",
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolveFifaWc26Theme(override: unknown): FifaWc26Theme {
  if (!override || typeof override !== "object") return FIFA_WC26_THEME_DEFAULTS;
  const out: FifaWc26Theme = { ...FIFA_WC26_THEME_DEFAULTS };
  for (const key of Object.keys(FIFA_WC26_THEME_DEFAULTS) as (keyof FifaWc26Theme)[]) {
    const v = (override as Record<string, unknown>)[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v;
  }
  return out;
}

export const FIFA_WC26_MAP_STYLE_DEFAULT = "mapbox://styles/mapbox/dark-v11";

export function resolveFifaWc26MapStyle(override: unknown): string {
  if (!override || typeof override !== "object") return FIFA_WC26_MAP_STYLE_DEFAULT;
  const v = (override as Record<string, unknown>).mapStyle;
  return typeof v === "string" && v.length > 0 ? v : FIFA_WC26_MAP_STYLE_DEFAULT;
}

// Assembles the semantic Mapbox MapPalette used to restyle the stock
// `mapbox/dark-v11` base layers (land/water/border/labels/buildings) so the
// base map matches the epic's palette. Applied via `applyMapPalette` in
// FifaWc26Landing's load handler.
export function fifaWc26MapPalette(theme: FifaWc26Theme): MapPalette {
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
