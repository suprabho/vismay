'use client';

import { useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import type { Entity } from '@/lib/useEntities';

type Palette = {
  base: string;
  top: string;
  border: string;
  hairline: string;
};

// The shell lays the brand color at ~0.8 alpha (the 'CC' suffix below) over the
// page background, so the *visible* card color — and therefore the contrast the
// text has to fight — is the composite, not the raw brand hex. We resolve ink
// against that composite so it stays legible whether the brand color is a dark
// purple or a pale sky blue, and across light/dark themes.
const CARD_ALPHA = 0.8;
const PAGE_BG_FALLBACK: [number, number, number] = [250, 247, 242]; // terrace cream

type Ink = { ink: string; muted: string; faint: string };
const INK_DARK: Ink = {
  ink: '#16161D',
  muted: 'rgba(22,22,29,0.64)',
  faint: 'rgba(22,22,29,0.12)',
};
const INK_LIGHT: Ink = {
  ink: '#FFFFFF',
  muted: 'rgba(255,255,255,0.72)',
  faint: 'rgba(255,255,255,0.16)',
};

function parseHex(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function composite(
  fg: [number, number, number],
  bg: [number, number, number],
  a: number,
): [number, number, number] {
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
  ];
}

// Pick whichever of black/white maximizes WCAG contrast against the visible
// card color (crossover at L≈0.179), so the choice is correct rather than a
// guess that fails on half the palette.
function inkFor(brandHex: string | null | undefined, pageBg: [number, number, number]): Ink {
  const brand = brandHex ? parseHex(brandHex) : null;
  if (!brand) return INK_LIGHT; // fallback card is dark (rgba(22,22,29,0.92))
  const L = relativeLuminance(composite(brand, pageBg, CARD_ALPHA));
  return L > 0.179 ? INK_DARK : INK_LIGHT;
}

// Read the live theme's page background ("R G B" channels) from the DOM. SSR
// returns the (light) terrace fallback; the client reads the real var, so dark
// themes get the right contrast. useSyncExternalStore handles the server/client
// divergence without a hydration warning. Snapshots are strings (compared by
// value) so React doesn't loop on a fresh-array identity each render.
const FALLBACK_SNAPSHOT = PAGE_BG_FALLBACK.join(' ');
const subscribeBg = () => () => {};
function getBgSnapshot(): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--sf-color-bg')
    .trim();
  return raw || FALLBACK_SNAPSHOT;
}

function usePageBg(): [number, number, number] {
  const snapshot = useSyncExternalStore(subscribeBg, getBgSnapshot, () => FALLBACK_SNAPSHOT);
  const parts = snapshot.split(/\s+/).map(Number);
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return [parts[0]!, parts[1]!, parts[2]!];
  }
  return PAGE_BG_FALLBACK;
}

function paletteFor(hex: string | null | undefined): Palette {
  const fallback: Palette = {
    base: 'rgba(22,22,29,0.92)',
    top: 'rgba(255,255,255,0.05)',
    border: '#2A2A34',
    hairline: 'rgba(255,255,255,0.10)',
  };
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return {
    base: hex + 'CC',
    top: hex,
    border: hex,
    hairline: 'rgba(255,255,255,0.22)',
  };
}

export function CardShell({ entity, children }: { entity: Entity; children: React.ReactNode }) {
  const palette = paletteFor(entity.primary_color);
  const pageBg = usePageBg();
  const ink = inkFor(entity.primary_color, pageBg);
  const style: CSSProperties = {
    borderColor: palette.border,
    backgroundColor: palette.base,
    color: ink.ink,
    ['--ink' as string]: ink.ink,
    ['--ink-muted' as string]: ink.muted,
    ['--ink-faint' as string]: ink.faint,
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border" style={style}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[120px]"
        style={{ backgroundColor: palette.top, opacity: 0.35 }}
      />
      <div className="relative p-4">{children}</div>
    </div>
  );
}

export function CollapsedHeader({
  entity,
  primary,
  secondary,
  chipLabel,
}: {
  entity: Entity;
  primary: string;
  secondary: string | null;
  chipLabel: string | null;
}) {
  return (
    <div className="flex items-center">
      <div className="mr-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[color:var(--ink-faint)]">
        {entity.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entity.crest_url} alt="" className="h-[42px] w-[42px] object-contain" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pr-2">
        <div className="truncate text-[17px] font-bold tracking-tight text-[color:var(--ink)]">
          {primary}
        </div>
        {secondary ? (
          <div className="mt-0.5 truncate text-xs text-[color:var(--ink-muted)]">{secondary}</div>
        ) : null}
      </div>
      {chipLabel ? (
        <span className="rounded-full border border-[color:var(--ink-faint)] bg-[color:var(--ink-faint)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--ink)]">
          {chipLabel}
        </span>
      ) : null}
    </div>
  );
}

export function SectionLabel({ text }: { text: string }) {
  return (
    <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.8px] text-[color:var(--ink-muted)]">
      {text}
    </div>
  );
}
