// Palette for the AI Data Centers epic landing. Same shape and override
// mechanics as app/energy-profile/theme.ts — the epic row's `theme` jsonb
// wins over these defaults — but tuned cooler (steel/cyan) to read as
// infrastructure rather than energy.

import type { MapPalette } from "@vismay/viz-engine";

export type AiDataCentersTheme = {
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
  mapLand: string;
  mapWater: string;
  mapBorder: string;
  mapLabelText: string;
  mapLabelHalo: string;
  mapBuilding: string;
};

export const AI_DATA_CENTERS_THEME_DEFAULTS: AiDataCentersTheme = {
  ink: "#0a0c0f",
  surface: "#0b0e12",
  elevated: "#161b22",
  bone: "#dbe7f0",
  muted: "#8b98a5",
  line: "#232b33",
  accent: "#22d3ee",
  accentMid: "#5eead4",
  accentHi: "#a5f3fc",
  accentLo: "#7a99a8",
  accentEdge: "#cffafe",
  mapLand: "#161b22",
  mapWater: "#0a0c0f",
  mapBorder: "#232b33",
  mapLabelText: "#dbe7f0",
  mapLabelHalo: "#0a0c0f",
  mapBuilding: "#161b22",
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolveAiDataCentersTheme(override: unknown): AiDataCentersTheme {
  if (!override || typeof override !== "object") return AI_DATA_CENTERS_THEME_DEFAULTS;
  const out: AiDataCentersTheme = { ...AI_DATA_CENTERS_THEME_DEFAULTS };
  for (const key of Object.keys(AI_DATA_CENTERS_THEME_DEFAULTS) as (keyof AiDataCentersTheme)[]) {
    const v = (override as Record<string, unknown>)[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v;
  }
  return out;
}

export const AI_DATA_CENTERS_MAP_STYLE_DEFAULT = "mapbox://styles/mapbox/dark-v11";

export function resolveAiDataCentersMapStyle(override: unknown): string {
  if (!override || typeof override !== "object") return AI_DATA_CENTERS_MAP_STYLE_DEFAULT;
  const v = (override as Record<string, unknown>).mapStyle;
  return typeof v === "string" && v.length > 0 ? v : AI_DATA_CENTERS_MAP_STYLE_DEFAULT;
}

export function aiDataCentersMapPalette(theme: AiDataCentersTheme): MapPalette {
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

export function aiDataCentersLogoPalette(theme: AiDataCentersTheme) {
  return {
    text: theme.bone,
    teal: theme.accentHi,
    accent: theme.accent,
    accent2: theme.accentMid,
    surface: theme.surface,
    muted: theme.muted,
    line: theme.bone,
  };
}
