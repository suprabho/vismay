import type { Entity } from '@/lib/useEntities';

type Palette = {
  base: string;
  top: string;
  border: string;
  hairline: string;
};

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
  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{ borderColor: palette.border, backgroundColor: palette.base }}
    >
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
      <div className="mr-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white/40">
        {entity.crest_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entity.crest_url} alt="" className="h-[42px] w-[42px] object-contain" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1 pr-2">
        <div className="truncate text-[17px] font-bold tracking-tight text-text">{primary}</div>
        {secondary ? (
          <div className="mt-0.5 truncate text-xs text-text/65">{secondary}</div>
        ) : null}
      </div>
      {chipLabel ? (
        <span className="rounded-full border border-white/30 bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-text">
          {chipLabel}
        </span>
      ) : null}
    </div>
  );
}

export function SectionLabel({ text }: { text: string }) {
  return (
    <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.8px] text-text/80">
      {text}
    </div>
  );
}
