// Palette for the /wallet-geo epic landing. A cyber-teal scheme to distinguish
// the crypto epic from the warm Energy Profile palette and the noir-dossier
// Epstein palette. Admin overrides per epic row in DB win over these defaults.

import type { MapPalette } from "@vismay/viz-engine";

export type WalletGeoTheme = {
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

export const WALLET_GEO_THEME_DEFAULTS: WalletGeoTheme = {
  ink: "#06080d",
  surface: "#0b0f17",
  elevated: "#11161f",
  bone: "#e6f5fb",
  muted: "#7e94a8",
  line: "#1a2330",
  accent: "#22d3ee",
  accentMid: "#67e8f9",
  accentHi: "#a5f3fc",
  accentLo: "#0e7490",
  accentEdge: "#cffafe",
  mapLand: "#11161f",
  mapWater: "#06080d",
  mapBorder: "#1a2330",
  mapLabelText: "#e6f5fb",
  mapLabelHalo: "#06080d",
  mapBuilding: "#11161f",
};

export const WALLET_GEO_THEME_LABELS: Record<keyof WalletGeoTheme, { label: string; hint: string }> = {
  ink: { label: "Ink", hint: "Page background, text halo" },
  surface: { label: "Surface", hint: "Side panel background" },
  elevated: { label: "Elevated", hint: "Card / hover state" },
  bone: { label: "Bone", hint: "Primary text, logo" },
  muted: { label: "Muted", hint: "Secondary text" },
  line: { label: "Line", hint: "Dividers and borders" },
  accent: { label: "Accent", hint: "Mid-volume country fill" },
  accentMid: { label: "Accent Mid", hint: "Hovered pin" },
  accentHi: { label: "Accent High", hint: "Selected country / top-volume fill" },
  accentLo: { label: "Accent Low", hint: "Low-volume country fill" },
  accentEdge: { label: "Accent Edge", hint: "Pin stroke + label text" },
  mapLand: { label: "Map Land", hint: "Country / land fill on the base map" },
  mapWater: { label: "Map Water", hint: "Ocean + waterway fill" },
  mapBorder: { label: "Map Border", hint: "Country boundary lines" },
  mapLabelText: { label: "Map Label Text", hint: "Country / place label color" },
  mapLabelHalo: { label: "Map Label Halo", hint: "Outline behind label text" },
  mapBuilding: { label: "Map Building", hint: "3D / 2D building fill" },
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolveWalletGeoTheme(override: unknown): WalletGeoTheme {
  if (!override || typeof override !== "object") return WALLET_GEO_THEME_DEFAULTS;
  const out: WalletGeoTheme = { ...WALLET_GEO_THEME_DEFAULTS };
  for (const key of Object.keys(WALLET_GEO_THEME_DEFAULTS) as (keyof WalletGeoTheme)[]) {
    const v = (override as Record<string, unknown>)[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v;
  }
  return out;
}

export function walletGeoMapPalette(theme: WalletGeoTheme): MapPalette {
  return {
    land: theme.mapLand,
    water: theme.mapWater,
    border: theme.mapBorder,
    labelText: theme.mapLabelText,
    labelHalo: theme.mapLabelHalo,
    building: theme.mapBuilding,
  };
}

export function walletGeoLogoPalette(theme: WalletGeoTheme) {
  return {
    text: theme.bone,
    teal: theme.accentMid,
    accent: theme.accent,
    accent2: theme.accentHi,
    surface: theme.surface,
    muted: theme.muted,
    line: theme.bone,
  };
}

// 5-stop choropleth ramp from low to high address volume, derived from the
// theme. Used by the landing component's fill expression.
export function walletGeoChoroplethStops(theme: WalletGeoTheme): string[] {
  return [
    theme.accentLo,   // <  5k addresses
    "#0e88a3",        // 5k – 20k
    theme.accent,     // 20k – 50k
    theme.accentMid,  // 50k – 100k
    theme.accentHi,   // > 100k
  ];
}
