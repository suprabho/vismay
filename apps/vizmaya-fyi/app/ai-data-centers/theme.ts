// Palette for the AI Data Centers epic landing and the daily snapshot
// editions. Same shape and override mechanics as app/energy-profile/theme.ts
// — the epic row's `theme` jsonb wins over these defaults — but tuned cooler
// (steel/cyan) to read as infrastructure rather than energy.
//
// The edition page (app/ai-daily/doom-v-boom) extends the explorer's tokens
// with the ones the design mockup fixes: `raised`, `dim`, `lineStrong`,
// `accentInk`, `up`/`down`, a lime `energy` accent reserved for the energy
// chapter, the three composition hues and the map dot colours. The Doom v
// Boom reading has its own red/green pair (`doom`/`boom` for marks, `doomInk`/
// `boomInk` for text) so the header ring and Chapter I never borrow the
// market tape's up/down. Each AI layer has its own accent (`layerDc` …
// `layerEquip`) for its Chapter IV tile: cyan, indigo, amber and purple,
// chosen clear of the reserved hues above (red, green, teal, lime and the
// composition terracotta) and checked for colour-blind separation. A light
// theme derived from the same tokens sits alongside for
// prefers-color-scheme: light / data-theme="light".

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
  /* Edition tokens; see /ai-daily/doom-v-boom/sample. */
  raised: string;
  dim: string;
  lineStrong: string;
  accentInk: string;
  up: string;
  down: string;
  doom: string;
  boom: string;
  doomInk: string;
  boomInk: string;
  energy: string;
  comp1: string;
  comp2: string;
  comp3: string;
  mapDot: string;
  mapDotHi: string;
  layerDc: string;
  layerHyper: string;
  layerSemi: string;
  layerEquip: string;
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
  raised: "#1c232c",
  dim: "#5f6b76",
  lineStrong: "#2f3941",
  accentInk: "#06282e",
  up: "#5eead4",
  down: "#f0a0a0",
  doom: "#f87171",
  boom: "#4ade80",
  doomInk: "#f87171",
  boomInk: "#4ade80",
  energy: "#c8e66b",
  comp1: "#d4705f",
  comp2: "#14a3ba",
  comp3: "#96b532",
  mapDot: "#333f49",
  mapDotHi: "#46545f",
  layerDc: "#22d3ee",
  layerHyper: "#6366f1",
  layerSemi: "#fbbf24",
  layerEquip: "#c084fc",
};

/** Light theme for the edition page — the same tokens, re-stepped for a paper surface. */
export const AI_DATA_CENTERS_THEME_LIGHT: AiDataCentersTheme = {
  ...AI_DATA_CENTERS_THEME_DEFAULTS,
  ink: "#eef2f5",
  surface: "#f4f7f9",
  elevated: "#ffffff",
  bone: "#0f171d",
  muted: "#54626e",
  line: "#d6dee4",
  accent: "#0891b2",
  accentMid: "#0f766e",
  accentHi: "#155e75",
  accentLo: "#5b7c8a",
  accentEdge: "#0e7490",
  raised: "#ffffff",
  dim: "#7b8792",
  lineStrong: "#bfcad3",
  accentInk: "#e0f7fb",
  up: "#0f766e",
  down: "#b42318",
  doom: "#dc2626",
  boom: "#16a34a",
  doomInk: "#b91c1c",
  boomInk: "#15803d",
  energy: "#5f7a00",
  comp1: "#c2410c",
  comp2: "#0891b2",
  comp3: "#5f7a00",
  mapDot: "#c9d3da",
  mapDotHi: "#aab8c2",
  layerDc: "#0891b2",
  layerHyper: "#4338ca",
  layerSemi: "#c98510",
  layerEquip: "#a855f7",
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

/**
 * The epic-row keys the editor overrode (hex only), so the edition page can
 * emit just those as CSS variables over the stylesheet defaults.
 */
export function aiDataCentersThemeOverrides(override: unknown): Partial<AiDataCentersTheme> {
  const out: Partial<AiDataCentersTheme> = {};
  if (!override || typeof override !== "object") return out;
  for (const key of Object.keys(AI_DATA_CENTERS_THEME_DEFAULTS) as (keyof AiDataCentersTheme)[]) {
    const v = (override as Record<string, unknown>)[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v;
  }
  return out;
}

/** Theme key → the CSS custom property the edition stylesheet reads. */
export const EDITION_CSS_VARS: Partial<Record<keyof AiDataCentersTheme, string>> = {
  ink: "--ink",
  surface: "--surface",
  elevated: "--elevated",
  raised: "--raised",
  bone: "--bone",
  muted: "--muted",
  dim: "--dim",
  line: "--line",
  lineStrong: "--line-strong",
  accent: "--accent",
  accentMid: "--accent-mid",
  accentHi: "--accent-hi",
  accentLo: "--accent-lo",
  accentEdge: "--accent-edge",
  accentInk: "--accent-ink",
  up: "--up",
  down: "--down",
  doom: "--doom",
  boom: "--boom",
  doomInk: "--doom-ink",
  boomInk: "--boom-ink",
  energy: "--energy",
  mapDot: "--map-dot",
  mapDotHi: "--map-dot-hi",
  comp1: "--comp1",
  comp2: "--comp2",
  comp3: "--comp3",
  layerDc: "--layer-dc",
  layerHyper: "--layer-hyper",
  layerSemi: "--layer-semi",
  layerEquip: "--layer-equip",
};

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
