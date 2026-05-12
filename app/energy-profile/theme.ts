// Palette for the Energy Profile epic landing. Defaults mirror the hardcoded
// values in EnergyProfileLanding.tsx (globe map: country fills, animated pulse
// pins, labels) so the unthemed page is pixel-identical.
//
// Admin override: each epic row in the DB carries a `theme` jsonb column. Any
// keys present there win over these defaults — see resolveEnergyProfileTheme below.

export type EnergyProfileTheme = {
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
};

export const ENERGY_PROFILE_THEME_DEFAULTS: EnergyProfileTheme = {
  ink: "#0a0a0a",
  surface: "#0a0a0b",
  elevated: "#18181b",
  bone: "#f5e6cc",
  muted: "#a1a1aa",
  line: "#27272a",
  accent: "#ff8c28",
  accentMid: "#ffaa3c",
  accentHi: "#ffc850",
  accentLo: "#b4a58c",
  accentEdge: "#ffdca0",
};

export const ENERGY_PROFILE_THEME_LABELS: Record<keyof EnergyProfileTheme, { label: string; hint: string }> = {
  ink: { label: "Ink", hint: "Page background, text halo" },
  surface: { label: "Surface", hint: "Side panel background" },
  elevated: { label: "Elevated", hint: "Card / hover state" },
  bone: { label: "Bone", hint: "Primary text, logo" },
  muted: { label: "Muted", hint: "Secondary text" },
  line: { label: "Line", hint: "Dividers and borders" },
  accent: { label: "Accent", hint: "Active pin + news country fill" },
  accentMid: { label: "Accent Mid", hint: "Hovered pin" },
  accentHi: { label: "Accent High", hint: "Selected pin + outlines + featured fill" },
  accentLo: { label: "Accent Low", hint: "Inactive (no-news) pin" },
  accentEdge: { label: "Accent Edge", hint: "Pin stroke + label text" },
};

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function resolveEnergyProfileTheme(override: unknown): EnergyProfileTheme {
  if (!override || typeof override !== "object") return ENERGY_PROFILE_THEME_DEFAULTS;
  const out: EnergyProfileTheme = { ...ENERGY_PROFILE_THEME_DEFAULTS };
  for (const key of Object.keys(ENERGY_PROFILE_THEME_DEFAULTS) as (keyof EnergyProfileTheme)[]) {
    const v = (override as Record<string, unknown>)[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v;
  }
  return out;
}

// Maps the four recolorable slots in the Vizmaya Rive logo onto the Energy
// Profile palette. The Rive file expects text/teal/accent/accent2 plus optional
// surface/muted/line.
export function energyProfileLogoPalette(theme: EnergyProfileTheme) {
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
