// Palette for the FIFA WC 2026 epic landing. Mirrors the shape used by
// app/energy-profile/theme.ts so the admin theme editor (themeRegistry) picks
// it up without bespoke wiring. Greens + golds nod to the pitch + trophy.

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
  // 5-stop choropleth ramp. Ports world-cup-2026-atlas.config.yaml's
  // [$surface, $accent2, $teal, $amber, $accent] and brightens the peak so
  // the highest values still read on the dark base map.
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

export const FIFA_WC26_THEME_LABELS: Record<keyof FifaWc26Theme, { label: string; hint: string }> = {
  ink: { label: "Ink", hint: "Page background, text halo" },
  surface: { label: "Surface", hint: "Side panel + detail sheet background" },
  elevated: { label: "Elevated", hint: "Stat tile / hover state" },
  bone: { label: "Bone", hint: "Primary text, logo" },
  muted: { label: "Muted", hint: "Secondary text" },
  line: { label: "Line", hint: "Dividers and borders" },
  accent: { label: "Accent", hint: "Categorical fill (confederation/regime default)" },
  accentMid: { label: "Accent Mid", hint: "Hovered country" },
  accentHi: { label: "Accent High", hint: "Selected country + outlines" },
  accentLo: { label: "Accent Low", hint: "No-data country (e.g. regime-type missing)" },
  accentEdge: { label: "Accent Edge", hint: "Country stroke + label text" },
  ramp1: { label: "Ramp 1 — low", hint: "Choropleth low stop (lowest metric values)" },
  ramp2: { label: "Ramp 2", hint: "Choropleth low-mid stop" },
  ramp3: { label: "Ramp 3 — mid", hint: "Choropleth mid stop" },
  ramp4: { label: "Ramp 4", hint: "Choropleth high-mid stop" },
  ramp5: { label: "Ramp 5 — peak", hint: "Choropleth peak stop (highest metric values)" },
  mapLand: { label: "Map Land", hint: "Country / land fill on the base map" },
  mapWater: { label: "Map Water", hint: "Ocean + waterway fill" },
  mapBorder: { label: "Map Border", hint: "Country boundary lines" },
  mapLabelText: { label: "Map Label Text", hint: "Country / place label color" },
  mapLabelHalo: { label: "Map Label Halo", hint: "Outline behind label text" },
  mapBuilding: { label: "Map Building", hint: "3D / 2D building fill (subtle at low zoom)" },
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

// Assembles the semantic Mapbox MapPalette used to restyle the stock
// `mapbox/dark-v11` base layers (land/water/border/labels/buildings) so
// the base map matches the epic's palette. Applied via `applyMapPalette`
// in FifaWc26Landing's `onLoad` handler.
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

export function fifaWc26LogoPalette(theme: FifaWc26Theme) {
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
