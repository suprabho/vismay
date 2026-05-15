// Palette for the FIFA WC 2026 epic landing. Mirrors the shape used by
// app/energy-profile/theme.ts so the admin theme editor (themeRegistry) picks
// it up without bespoke wiring. Greens + golds nod to the pitch + trophy.

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
};

export const FIFA_WC26_THEME_LABELS: Record<keyof FifaWc26Theme, { label: string; hint: string }> = {
  ink: { label: "Ink", hint: "Page background, text halo" },
  surface: { label: "Surface", hint: "Side panel + detail sheet background" },
  elevated: { label: "Elevated", hint: "Stat tile / hover state" },
  bone: { label: "Bone", hint: "Primary text, logo" },
  muted: { label: "Muted", hint: "Secondary text" },
  line: { label: "Line", hint: "Dividers and borders" },
  accent: { label: "Accent", hint: "Default pin fill + rank bars" },
  accentMid: { label: "Accent Mid", hint: "Hovered pin" },
  accentHi: { label: "Accent High", hint: "Selected pin + outlines" },
  accentLo: { label: "Accent Low", hint: "No-data pin (e.g. regime-type missing)" },
  accentEdge: { label: "Accent Edge", hint: "Pin stroke + label text" },
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
