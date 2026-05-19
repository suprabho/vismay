"use client";

import type { BreakdownEntry } from "@/lib/wallet-geo/data";

interface Props {
  entries: BreakdownEntry[];
  total: number;
  colors: string[];
}

export default function BreakdownBars({ entries, total, colors }: Props) {
  const max = Math.max(1, ...entries.map((e) => e.count));
  return (
    <ul className="space-y-1.5">
      {entries.map((e, i) => {
        const pct = total > 0 ? (e.count / total) * 100 : 0;
        const barPct = (e.count / max) * 100;
        const color = colors[i % colors.length];
        return (
          <li key={e.key}>
            <div className="flex items-baseline justify-between gap-2 mb-0.5">
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span
                  className="text-[11px] truncate"
                  style={{ color: "color-mix(in srgb, var(--vmy-bone) 88%, transparent)" }}
                >
                  {e.label}
                </span>
                {e.confidential && (
                  <span
                    className="shrink-0 px-1 py-px rounded text-[8px] font-mono uppercase tracking-wider"
                    style={{
                      background: "color-mix(in srgb, var(--vmy-bone) 8%, transparent)",
                      color: "color-mix(in srgb, var(--vmy-bone) 60%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--vmy-bone) 12%, transparent)",
                    }}
                  >
                    Gated
                  </span>
                )}
              </span>
              <span
                className="text-[10px] font-mono tabular-nums shrink-0"
                style={{ color: "color-mix(in srgb, var(--vmy-bone) 60%, transparent)" }}
              >
                {e.count.toLocaleString()}{" "}
                <span
                  className="ml-0.5"
                  style={{ color: "color-mix(in srgb, var(--vmy-bone) 40%, transparent)" }}
                >
                  {pct.toFixed(pct < 10 ? 1 : 0)}%
                </span>
              </span>
            </div>
            <div
              className="relative h-1.5 w-full rounded-full overflow-hidden"
              style={{ background: "color-mix(in srgb, var(--vmy-bone) 6%, transparent)" }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${barPct}%`, background: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
