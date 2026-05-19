// "The Dossier" palette for the Epstein epic. Centralized so the map paint
// expressions, the Rive logo, and the detail panels all stay in sync.
//
// Admin override: each epic row in the DB carries a `theme` jsonb column. Any
// keys present there win over these defaults — see resolveEpsteinTheme below.

import type { MapPalette } from "@vismay/viz-engine";
export type EpsteinTheme = {
  ink: string;
  surface: string;
  elevated: string;
  bone: string;
  muted: string;
  line: string;
  ember: string;
  steel: string;
  rose: string;
  signal: string;
  mapLand: string;
  mapWater: string;
  mapBorder: string;
  mapLabelText: string;
  mapLabelHalo: string;
  mapBuilding: string;
};

export const EPSTEIN_THEME_DEFAULTS: EpsteinTheme = {
  ink: "#0a0d12",
  surface: "#141923",
  elevated: "#1c2230",
  bone: "#ede4d3",
  muted: "#7a8497",
  line: "#1f2632",
  ember: "#e89f5d",
  steel: "#6ba3c4",
  rose: "#c97a9c",
  signal: "#d96548",
  mapLand: "#1c2230",
  mapWater: "#0a0d12",
  mapBorder: "#1f2632",
  mapLabelText: "#ede4d3",
  mapLabelHalo: "#0a0d12",
  mapBuilding: "#1c2230",
};

export const EPSTEIN_THEME_LABELS: Record<keyof EpsteinTheme, { label: string; hint: string }> = {
  ink: { label: "Ink", hint: "Page background, halos" },
  surface: { label: "Surface", hint: "Panels and chips" },
  elevated: { label: "Elevated", hint: "Hover/pressed surfaces" },
  bone: { label: "Bone", hint: "Primary text on dark" },
  muted: { label: "Muted", hint: "Secondary text, labels" },
  line: { label: "Line", hint: "Dividers and borders" },
  ember: { label: "Ember", hint: "Primary accent — airports / origin" },
  steel: { label: "Steel", hint: "Secondary accent — destinations" },
  rose: { label: "Rose", hint: "Black-book points and emails" },
  signal: { label: "Signal", hint: "Strong-warning highlight" },
  mapLand: { label: "Map Land", hint: "Country / land fill on the base map" },
  mapWater: { label: "Map Water", hint: "Ocean + waterway fill" },
  mapBorder: { label: "Map Border", hint: "Country boundary lines" },
  mapLabelText: { label: "Map Label Text", hint: "Country / place label color" },
  mapLabelHalo: { label: "Map Label Halo", hint: "Outline behind label text" },
  mapBuilding: { label: "Map Building", hint: "3D / 2D building fill (subtle at low zoom)" },
};

// Back-compat: a handful of imports still reference EPSTEIN_THEME as a static
// constant. Anywhere that can take a resolved theme should prefer the prop.
export const EPSTEIN_THEME = EPSTEIN_THEME_DEFAULTS;

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolveEpsteinTheme(override: unknown): EpsteinTheme {
  if (!override || typeof override !== "object") return EPSTEIN_THEME_DEFAULTS;
  const out: EpsteinTheme = { ...EPSTEIN_THEME_DEFAULTS };
  for (const key of Object.keys(EPSTEIN_THEME_DEFAULTS) as (keyof EpsteinTheme)[]) {
    const v = (override as Record<string, unknown>)[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v;
  }
  return out;
}

// Assembles the semantic Mapbox MapPalette used to restyle the stock
// `mapbox/dark-v11` base layers (land/water/border/labels/buildings) so
// the base map matches the dossier palette. Applied via `applyMapPalette`
// in EpsteinMap's `onLoad` handler.
export function epsteinMapPalette(theme: EpsteinTheme): MapPalette {
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

// Maps the four recolorable slots in the Vizmaya Rive logo onto the dossier
// palette. The Rive file expects text/teal/accent/accent2 plus optional
// surface/muted/line — we feed it bone + the three signal hues.
export function epsteinLogoPalette(theme: EpsteinTheme) {
  return {
    text: theme.bone,
    teal: theme.steel,
    accent: theme.ember,
    accent2: theme.rose,
    surface: theme.surface,
    muted: theme.muted,
    line: theme.line,
  };
}

export const EPSTEIN_LOGO_PALETTE = epsteinLogoPalette(EPSTEIN_THEME_DEFAULTS);
