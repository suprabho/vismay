'use client'

import dynamic from 'next/dynamic'
import type { EChartsOption } from 'echarts'
import { useChartColors, useIsMobile } from '@/lib/chartTheme'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

// KOSPI 2026 — weekly OHLC around the March 2026 Iran war crash
// Indexed to 100 at start. 18% drop in 4 trading days.
const data2026 = [
  // [open, close, low, high]  — each bar = 1 trading day
  [100.0, 100.8, 99.5,  101.2],
  [101.0, 100.2, 99.8,  101.5],
  [100.3,  99.7, 99.1,  100.6],
  // War breaks out — the 4-day collapse
  [ 99.5,  95.1, 94.2,  99.5],  // day 1: -4.4%
  [ 95.0,  90.2, 89.5,  95.3],  // day 2: -5.1%
  [ 90.0,  86.4, 85.8,  90.4],  // day 3: -4.1%
  [ 86.2,  82.0, 81.3,  86.5],  // day 4: -5.0%  total: -18%
]

// 2008 Financial Crisis — GFC peak-to-trough, same 100-indexed scale
// KOSPI lost ~54% from Oct 2007 peak to Oct 2008 low (weekly)
const data2008 = [
  [100.0, 97.8,  96.5, 100.4], // Oct 07
  [ 97.8, 94.1,  93.0,  98.5], // Nov 07
  [ 94.2, 91.5,  90.0,  94.8], // Dec 07
  [ 91.5, 89.2,  87.8,  92.0], // Jan 08
  [ 89.0, 85.5,  84.0,  89.5], // Feb 08
  [ 85.5, 80.2,  79.0,  86.0], // Mar 08
  [ 80.0, 75.5,  74.0,  81.0], // Apr 08
  [ 75.5, 76.8,  74.5,  78.0], // May 08 — brief rebound
  [ 76.8, 68.0,  67.0,  77.2], // Jun 08
  [ 68.0, 63.5,  62.5,  68.5], // Jul 08
  [ 63.5, 55.0,  54.0,  64.0], // Aug 08
  [ 55.0, 52.0,  50.5,  56.0], // Sep 08 — Lehman
  [ 52.0, 46.0,  45.0,  52.5], // Oct 08
]

const LABELS_2026 = ['Feb 26', 'Feb 27', 'Feb 28', 'Mar 1', 'Mar 2', 'Mar 3', 'Mar 4']
const LABELS_2008 = ['Oct 07', 'Nov 07', 'Dec 07', 'Jan 08', 'Feb 08', 'Mar 08', 'Apr 08', 'May 08', 'Jun 08', 'Jul 08', 'Aug 08', 'Sep 08', 'Oct 08']

const TITLES: Record<number, string> = {
  0: '2026: KOSPI falls 18% in 4 trading days \n worst since 2008',
  1: '2008 vs 2026 speed is the difference \n 2026 hit in 4 days, 2008 took a year',
}

// Trading-day offset from each crisis peak (≈21 trading days per month).
// 2026 = daily samples; 2008 = monthly samples spaced by ~21 sessions.
// For the overlay view, collapse the 4-day crash into a single candle:
// open = first day's open, close = last day's close, low/high = window extremes.
const data2026Overlay = [[
  0,                                      // x (trading-day offset, left edge of crash window)
  data2026[3][0],                         // open  (day 1 of crash)
  data2026[6][1],                         // close (day 4 of crash)
  Math.min(...data2026.slice(3).map((d) => d[2])), // low
  Math.max(...data2026.slice(3).map((d) => d[3])), // high
]]
const data2008Overlay = [0, 21, 42, 63, 84, 105, 126, 147, 168, 189, 210, 231, 252].map(
  (x, i) => [x, ...data2008[i]],
)

export default function StockCandlestickChart({ activeStep }: { activeStep: number }) {
  const { red: RED, accent2: ACCENT2, muted: MUTED, line: LINE, green: GREEN, amber: AMBER } = useChartColors()
  const mobile = useIsMobile()
  const title = TITLES[activeStep] ?? TITLES[0]
  const show2008 = activeStep >= 1

  // Step 1: overlap both series on a single value-axis "trading days from peak".
  // 2026 collapses into the leftmost ~6 days while 2008 stretches across ~250.
  if (show2008) {
    const overlayOption: EChartsOption = {
      // ── Canvas ─────────────────────────────────────────
      backgroundColor: 'transparent', // chart background (lets page bg show through)
      // ── Animation on mount / data swap ─────────────────
      animation: true,
      animationDuration: 700,
      animationEasing: 'cubicOut',
      // ── Caption under the chart (the small title text) ─
      title: {
        text: title,
        left: 'center',
        bottom: 0,
        textStyle: { color: MUTED, fontSize: mobile ? 9 : 11, fontWeight: 'normal', fontFamily: 'var(--font-mono)' },
      },
      // ── Legend (the two color swatches above caption) ──
      legend: {
        bottom: 22, // sits just above the title caption
        left: 'center',
        // Hide the built-in icon — candlestick legend ignores per-item itemStyle,
        // so we draw the swatch ourselves via a rich-text colored block.
        icon: 'none',
        itemWidth: 0,
        itemGap: 24,
        textStyle: {
          fontSize: 10,
          fontFamily: 'var(--font-mono)',
          rich: {
            // Colored "dash" blocks (background fill = color, height controls thickness)
            aBox: { backgroundColor: AMBER, width: 16, height: 2, verticalAlign: 'middle' },
            bBox: { backgroundColor: ACCENT2, width: 16, height: 2, verticalAlign: 'middle' },
            // Label text colors
            a: { color: AMBER, fontSize: 10, fontFamily: 'var(--font-mono)', padding: [0, 0, 0, 6] },
            b: { color: ACCENT2, fontSize: 10, fontFamily: 'var(--font-mono)', padding: [0, 0, 0, 6] },
          },
        },
        formatter: (name: string) =>
          name === '2026 (Iran War)' ? `{aBox|} {a|${name}}` : `{bBox|} {b|${name}}`,
        data: [
          { name: '2026 (Iran War)', itemStyle: { color: AMBER } },
          { name: '2008 (GFC)', itemStyle: { color: ACCENT2 } },
        ],
      },
      // ── Plot area padding (controls chart inset) ───────
      // right padding leaves room for the -18% / -54% markLine labels
      // (position: 'end') so they don't get clipped at narrow widths.
      grid: mobile
        ? { left: 36, right: 50, top: 28, bottom: 55 }
        : { left: 55, right: 50, top: 35, bottom: 70 },
      // ── X axis: shared "trading days from peak" scale ──
      xAxis: {
        type: 'value',
        min: -5,
        max: 260,
        axisLine: { show: false }, // hide the axis baseline
        axisTick: { show: false }, // hide tick marks
        axisLabel: { color: MUTED, fontSize: mobile ? 7 : 9, formatter: '{value}d' },
        splitLine: { show: false }, // no vertical gridlines
      },
      // ── Y axis: indexed price (100 = peak) ─────────────
      yAxis: {
        type: 'value',
        min: 40,
        max: 105,
        name: 'Indexed (100 = pre-crisis peak)', // axis title text
        nameLocation: 'middle',
        nameGap: 38, // distance of axis title from axis line
        nameRotate: 90, // vertical axis title
        nameTextStyle: { color: MUTED, fontSize: 9 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: MUTED, fontSize: 9, formatter: '{value}' },
        splitLine: { lineStyle: { color: LINE } }, // horizontal gridlines color
      },
      series: [
        // ── 2008 GFC candlesticks (the slow-burn series) ─
        {
          name: '2008 (GFC)',
          type: 'candlestick',
          data: data2008Overlay,
          barWidth: 24, // candle body width in pixels
          itemStyle: {
            color: GREEN,        // up-day fill
            color0: RED,    // down-day fill (blue for GFC)
            borderColor: GREEN,  // up-day border
            borderColor0: RED, // down-day border
          },
          // Dashed horizontal line marking the −54% trough
          markLine: {
            silent: true,
            symbol: 'none', // no arrowheads on line endpoints
            data: [
              {
                yAxis: 46, // y-value where the line sits
                lineStyle: { color: ACCENT2, width: 1, type: 'dashed' as const, opacity: 1 },
                label: {
                  show: true,
                  formatter: '−54%',
                  color: ACCENT2,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  position: 'end' as const, // label at right end of line
                },
              },
            ],
          },
        },
        // ── 2026 Iran War candlesticks (the fast crash) ──
        {
          name: '2026 (Iran War)',
          type: 'candlestick',
          data: data2026Overlay,
          barWidth: 4, // thinner candles since these are daily samples
          itemStyle: {
            color: GREEN,       // up-day fill
            color0: RED,       // down-day fill (red for the crash)
            borderColor: GREEN,
            borderColor0: RED,
          },
          // Amber tinted band highlighting the 4-day collapse window
          markArea: {
            silent: true,
            itemStyle: { color: AMBER, opacity: 0.08 }, // band fill — keep low opacity
            data: [
              [
                { xAxis: 0, name: '4 days' },  // band start (and label)
                { xAxis: 4 },                  // band end (4-day collapse window)
              ],
            ],
            label: {
              show: true,
              color: AMBER,
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              fontWeight: 700,
              position: 'insideTop' as const, // label sits inside top of band
            },
          },
          // Dashed line marking the 2026 −18% level
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                yAxis: 82,
                xAxis: 6,
                lineStyle: { color: AMBER, width: 1, type: 'dashed' as const, opacity: 1 },
                label: {
                  show: true,
                  formatter: '−18%',
                  color: AMBER,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 700,
                  position: 'end' as const,
                },
              },
            ],
          },
        },
      ],
      tooltip: { show: false }, // hover tooltip disabled
    }

    return (
      <div className="w-full h-full flex flex-col">
        <ReactECharts
          option={overlayOption}
          style={{ height: mobile ? '100%' : 380, width: '100%', flex: mobile ? 1 : undefined }}
          opts={{ renderer: 'svg' }}
          notMerge={true}
        />
        <div
          className="text-center mt-1 shrink-0"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'MUTED' }}
        >
          KOSPI index, rebased to 100 at pre-crisis peak. Both crises overlaid on a shared
          trading-day axis. Sources: AInvest, Bitget News, Bloomberg.
        </div>
      </div>
    )
  }

  // ════════ Step 0: 2026-only single-panel view ═══════════
  const option: EChartsOption = {
    backgroundColor: 'transparent', // chart bg — transparent so page bg shows
    // ── Mount/transition animation ───────────────────────
    animation: true,
    animationDuration: 700,
    animationEasing: 'cubicOut',
    // ── Bottom caption text ──────────────────────────────
    title: {
      text: title,
      left: 'center',
      bottom: 0,
      textStyle: { color: MUTED, fontSize: mobile ? 9 : 11, fontWeight: 'normal', fontFamily: 'var(--font-mono)' },
    },
    // ── Legend swatches above caption ────────────────────
    legend: {
      bottom: 22,
      left: 'center',
      icon: 'none',
      itemWidth: 0,
      itemGap: 40,
      textStyle: {
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        rich: {
          aBox: { backgroundColor: AMBER, width: 16, height: 2, verticalAlign: 'middle' },
          bBox: { backgroundColor: ACCENT2, width: 16, height: 2, verticalAlign: 'middle' },
          a: { color: AMBER, fontSize: 10, fontFamily: 'var(--font-mono)', padding: [0, 0, 0, 6]},
          b: { color: ACCENT2, fontSize: 10, fontFamily: 'var(--font-mono)', padding: [0, 0, 0, 6] },
        },
      },
      formatter: (name: string) =>
        name === '2026 (Iran War)' ? `{aBox|} {a|${name}}` : `{bBox|} {b|${name}}`,
      data: [
        { name: '2026 (Iran War)', itemStyle: { color: AMBER } },
        ...(show2008 ? [{ name: '2008 (GFC)', itemStyle: { color: ACCENT2 } }] : []),
      ],
    },
    // ── Plot area inset (left/right/top/bottom padding) ──
    // Right padding leaves room for the −18% markLine label at position 'end'.
    grid: [
      mobile
        ? { left: 36, right: 50, top: 28, bottom: 55 }
        : { left: 55, right: 50, top: 35, bottom: 70 },
    ],
    // ── X axis: date labels for 2026 series ──────────────
    xAxis: [
      {
        type: 'category',
        data: LABELS_2026, // "Feb 26", "Feb 27"…
        gridIndex: 0,
        axisLine: { show: false }, // hide baseline
        axisTick: { show: false }, // hide ticks
        axisLabel: { color: MUTED, fontSize: 9 }, // date label styling
        splitLine: { show: false }, // no vertical gridlines
      },
      ...(show2008
        ? [
            {
              type: 'category' as const,
              data: LABELS_2008,
              gridIndex: 1,
              axisLine: { show: false },
              axisTick: { show: false },
              axisLabel: { color: MUTED, fontSize: 9 },
              splitLine: { show: false },
            },
          ]
        : []),
    ],
    // ── Y axis: indexed price (100 = peak) ───────────────
    yAxis: [
      {
        type: 'value',
        min: 78,
        max: 103,
        gridIndex: 0,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: MUTED, fontSize: 9, formatter: '{value}' }, // tick label styling
        splitLine: { lineStyle: { color: LINE } }, // horizontal gridlines color
        name: 'Indexed (100 = pre-crisis peak)', // axis title
        nameLocation: 'middle',
        nameGap: 38, // offset of axis title from axis
        nameRotate: 90, // rotate axis title vertical
        nameTextStyle: { color: MUTED, fontSize: 9 },
      },
      ...(show2008
        ? [
            {
              type: 'value' as const,
              min: 40,
              max: 103,
              gridIndex: 1,
              axisLine: { show: false },
              axisTick: { show: false },
              axisLabel: { color: MUTED, fontSize: 9, formatter: '{value}' },
              splitLine: { lineStyle: { color: LINE } },
            },
          ]
        : []),
    ],
    series: [
      // ── 2026 candlestick series ────────────────────────
      {
        name: '2026 (Iran War)',
        type: 'candlestick',
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: data2026,
        itemStyle: {
          color: GREEN,        // up-day fill
          color0: RED,        // down-day fill
          borderColor: GREEN,  // up-day border
          borderColor0: RED,  // down-day border
        },
        // Dashed line + label marking the −18% level
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: 82,
              lineStyle: { color: AMBER, width: 1, type: 'dashed' as const, opacity: 1 },
              label: {
                show: true,
                formatter: '-18%',
                color: AMBER,
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                position: 'end' as const,
              },
            },
          ],
        },
      },
      ...(show2008
        ? [
            {
              name: '2008 (GFC)',
              type: 'candlestick' as const,
              xAxisIndex: 1,
              yAxisIndex: 1,
              data: data2008,
              itemStyle: {
                color: GREEN,
                color0: RED,
                borderColor: GREEN,
                borderColor0: RED,
              },
              markLine: {
                silent: true,
                symbol: 'none',
                data: [
                  {
                    yAxis: 46,
                    lineStyle: { color: ACCENT2, width: 1, type: 'dashed' as const, opacity: 1 },
                    label: {
                      show: true,
                      formatter: '-54%',
                      color: ACCENT2,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      fontWeight: 700,
                      position: 'end' as const,
                    },
                  },
                ],
              },
            },
          ]
        : []),
    ],
    tooltip: { show: false },
  }

  return (
    <div className="w-full h-full flex flex-col">
      <ReactECharts
        option={option}
        style={{ height: mobile ? '100%' : 380, width: '100%', flex: mobile ? 1 : undefined }}
        opts={{ renderer: 'svg' }}
        notMerge={true}
      />
      <div
        className="text-center mt-1 shrink-0"
        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.55rem', color: 'var(--color-chrome-text-muted)' }}
      >
        KOSPI index, rebased to 100 at pre-crisis peak. Sources: AInvest, Bitget News, Bloomberg.
      </div>
    </div>
  )
}
