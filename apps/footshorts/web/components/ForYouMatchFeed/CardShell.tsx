'use client';

import type { CSSProperties } from 'react';
import { entityAvatarColor } from '@vismay/footshorts-viz/web';
import type { Entity } from '@/lib/useEntities';

// Color strategy: the card surface and text are FIXED to the theme tokens
// (--sf-color-surface / --sf-color-text), so contrast is always correct and we
// never have to reason about the brand color's luminance. The brand color is
// purely decorative — it tints the border, casts a soft shadow, and washes a
// subtle blurred gradient across the surface. A missing/invalid brand color
// just falls back to the neutral theme border with no glow.
function brandHex(hex: string | null | undefined): string | null {
  return hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
}

export function CardShell({ entity, children }: { entity: Entity; children: React.ReactNode }) {
  const brand = brandHex(entity.primary_color);
  const style: CSSProperties = {
    backgroundColor: 'rgb(var(--sf-color-surface))',
    color: 'rgb(var(--sf-color-text))',
    // '59' ≈ 35% alpha — a tint, not a full brand border.
    borderColor: brand ? `${brand}59` : 'rgb(var(--sf-color-border))',
    boxShadow: brand
      ? `0 10px 30px -14px ${brand}80, 0 2px 8px -4px rgb(0 0 0 / 0.06)`
      : '0 2px 8px -4px rgb(0 0 0 / 0.06)',
    ['--ink' as string]: 'rgb(var(--sf-color-text))',
    ['--ink-muted' as string]: 'rgb(var(--sf-color-muted))',
    ['--ink-faint' as string]: 'rgb(var(--sf-color-text) / 0.10)',
  };
  return (
    <div className="relative overflow-hidden rounded-2xl border" style={style}>
      {brand ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[150%] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background: `radial-gradient(closest-side, ${brand}, transparent)`,
            opacity: 0.22,
          }}
        />
      ) : null}
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
  const avatarBg = entityAvatarColor(entity);
  return (
    <div className="flex items-center">
      <div
        className="mr-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[color:var(--ink-faint)]"
        style={{ backgroundColor: avatarBg ?? undefined }}
      >
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
