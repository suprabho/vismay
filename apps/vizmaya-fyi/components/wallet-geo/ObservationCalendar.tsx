"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import type { DailyObservation } from "@/lib/wallet-geo/data";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

interface Props {
  observations: DailyObservation[];
  accent: string;
  accentMid: string;
  accentLo: string;
  line: string;
  muted: string;
}

// GitHub-style heatmap: weeks on x, day-of-week on y. ECharts' calendar
// coordinate system does the grid lifting for us — we render one heatmap
// series of (date, count) pairs over it.
export default function ObservationCalendar({
  observations,
  accent,
  accentMid,
  accentLo,
  line,
  muted,
}: Props) {
  const { option, range } = useMemo(() => {
    if (observations.length === 0) {
      return { option: null as EChartsOption | null, range: ["", ""] as const };
    }
    const sorted = [...observations].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0
    );
    const first = sorted[0].date;
    const last = sorted[sorted.length - 1].date;
    const data: [string, number][] = sorted.map((o) => [o.date, o.count]);
    const max = Math.max(1, ...sorted.map((o) => o.count));

    const opt: EChartsOption = {
      backgroundColor: "transparent",
      tooltip: {
        backgroundColor: "#18181b",
        borderColor: line,
        textStyle: { color: "#f4f4f5", fontSize: 11 },
        // ECharts' formatter param is broadly typed (`value: OptionDataValue
        // | OptionDataValue[]`), so we narrow at runtime. Our data is always
        // `[date, count]` tuples — see the heatmap series below.
        formatter: (params) => {
          const single = Array.isArray(params) ? params[0] : params;
          const raw = single?.value;
          if (!Array.isArray(raw) || raw.length < 2) return "";
          const date = String(raw[0]);
          const value = Number(raw[1]);
          const d = new Date(`${date}T00:00:00Z`);
          const human = d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          });
          return `<div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: #a1a1aa">${human}</div><div style="margin-top:2px"><strong>${value.toLocaleString()}</strong> obs</div>`;
        },
      },
      visualMap: {
        show: false,
        type: "piecewise",
        pieces: [
          { lt: 1, color: "transparent" },
          { gte: 1, lt: max * 0.15, color: accentLo },
          { gte: max * 0.15, lt: max * 0.35, color: accentMid },
          { gte: max * 0.35, lt: max * 0.65, color: accent },
          { gte: max * 0.65, color: accent },
        ],
      },
      calendar: {
        top: 26,
        left: 24,
        right: 6,
        bottom: 4,
        cellSize: ["auto", 10],
        range: [first, last],
        itemStyle: {
          color: "transparent",
          borderWidth: 1,
          borderColor: "transparent",
        },
        splitLine: { show: false },
        yearLabel: { show: false },
        dayLabel: {
          color: muted,
          fontSize: 9,
          nameMap: ["", "M", "", "W", "", "F", ""],
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        },
        monthLabel: {
          color: muted,
          fontSize: 9,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        },
      },
      series: [
        {
          type: "heatmap",
          coordinateSystem: "calendar",
          data,
          itemStyle: { borderRadius: 1, borderColor: "transparent", borderWidth: 0 },
        },
      ],
    };
    return { option: opt, range: [first, last] as const };
  }, [observations, accent, accentMid, accentLo, line, muted]);

  if (!option) {
    return (
      <div className="h-[120px] flex items-center justify-center text-[10px] font-mono text-zinc-600">
        No observations
      </div>
    );
  }

  return (
    <div>
      <ReactECharts option={option} style={{ height: 120, width: "100%" }} opts={{ renderer: "svg" }} />
      <div
        className="flex items-center justify-between mt-1 px-1"
        style={{ color: muted }}
      >
        <span className="text-[9px] font-mono">{formatRange(range[0])}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono">Less</span>
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "color-mix(in srgb, var(--vmy-bone) 6%, transparent)" }} />
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: accentLo }} />
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: accentMid }} />
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: accent }} />
          <span className="text-[9px] font-mono">More</span>
        </div>
        <span className="text-[9px] font-mono">{formatRange(range[1])}</span>
      </div>
    </div>
  );
}

function formatRange(iso: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}
