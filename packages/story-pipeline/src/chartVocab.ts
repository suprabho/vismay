/**
 * Chart vocabulary shared by the chart REQUIREMENT schema (what the outline
 * plans), the chart DATA schema (what the data pass emits), and the prompts.
 *
 * The chart pipeline compiles through `flint-chart` (a visualization
 * intermediate language): the model emits a compact tabular spec — columns with
 * semantic types, rows, and channel encodings — and `assembleECharts` derives a
 * full ECharts option. These constants are the curated slice of flint's
 * vocabulary we expose: chart templates that work with flat tabular data + the
 * channels/semantic types below, so a source-grounded LLM pass stays on solid
 * ground.
 */

/**
 * The flint chart templates the outline may plan and the data pass may emit.
 * Curated to the ones that assemble from flat rows with the {@link CHART_CHANNELS}
 * encodings (no source/target graphs, hierarchies, or OHLC inputs).
 */
export const CHART_TYPES = [
  'Bar Chart',
  'Grouped Bar Chart',
  'Stacked Bar Chart',
  'Line Chart',
  'Area Chart',
  'Range Area Chart',
  'Scatter Plot',
  'Connected Scatter Plot',
  'Pie Chart',
  'Rose Chart',
  'Funnel Chart',
  'Pyramid Chart',
  'Radar Chart',
  'Lollipop Chart',
  'Slope Chart',
  'Bump Chart',
  'Waterfall Chart',
  'Histogram',
] as const

export type ChartType = (typeof CHART_TYPES)[number]

/**
 * The encoding channels the data pass may map columns to. A curated slice of
 * flint's channel set — the ones the {@link CHART_TYPES} above consume:
 * - x / y — the primary axes (y also takes an array for static multi-series).
 * - y2 — the upper bound of a Range Area band.
 * - color — the series/category discriminator (legend).
 * - size — bubble magnitude on a scatter.
 * - angle / value — the slice/segment measure for pie/rose/funnel/pyramid.
 * - group / detail — secondary grouping for grouped/bump charts.
 */
export const CHART_CHANNELS = [
  'x',
  'y',
  'y2',
  'color',
  'size',
  'angle',
  'value',
  'group',
  'detail',
] as const

export type ChartChannel = (typeof CHART_CHANNELS)[number]

/**
 * A readable, non-exhaustive list of flint semantic types for the prompt. Any
 * flint semantic type is accepted (unknowns fall back to value inference); these
 * are the ones that come up in data stories, grouped for the model.
 */
export const SEMANTIC_TYPE_HINTS =
  'time — Year, YearMonth, Date, Quarter, Month, Decade, Duration; ' +
  'measures — Quantity, Count, Amount, Price, Percentage, PercentageChange, ' +
  'Temperature, Profit, Score, Rank; ' +
  'categorical — Category, Country, State, City, Region, Name, Status, Direction'
